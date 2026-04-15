/**
 * Auto-Retrieve MCP Hook
 * 
 * Automatically calls the gsd-qdrant MCP server's auto_retrieve tool
 * before each GSD response to inject relevant context.
 * 
 * This extension integrates seamlessly with the existing MCP client
 * and provides automatic cross-project knowledge retrieval.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let client = null;
let connected = false;
const CONNECT_TIMEOUT = 30000;

/**
 * Reads MCP server configuration from project files
 */
function readMcpConfig() {
  const configPaths = [
    join(process.cwd(), '.mcp.json'),
    join(process.cwd(), '.gsd', 'mcp.json'),
  ];
  
  for (const configPath of configPaths) {
    try {
      if (!existsSync(configPath)) continue;
      const raw = readFileSync(configPath, 'utf-8');
      const data = JSON.parse(raw);
      const mcpServers = data.mcpServers ?? data.servers;
      if (mcpServers && typeof mcpServers === 'object') {
        return mcpServers;
      }
    } catch {
      // Non-fatal
    }
  }
  return null;
}

/**
 * Connects to the gsd-qdrant MCP server
 */
async function connectToMcpServer() {
  if (connected) return client;
  
  const config = readMcpConfig();
  if (!config || !config['gsd-qdrant']) {
    console.log('[Auto-Retrieve MCP] No gsd-qdrant server configured');
    return null;
  }
  
  const serverConfig = config['gsd-qdrant'];
  if (!serverConfig.command) {
    console.log('[Auto-Retrieve MCP] gsd-qdrant has no command configured');
    return null;
  }
  
  try {
    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: serverConfig.env ? { ...process.env, ...serverConfig.env } : undefined,
      cwd: serverConfig.cwd,
    });
    
    const mcpClient = new Client({ name: 'gsd-auto-retrieve', version: '1.0.0' });
    await mcpClient.connect(transport, { timeout: CONNECT_TIMEOUT });
    
    client = mcpClient;
    connected = true;
    console.log('[Auto-Retrieve MCP] Connected to gsd-qdrant server');
    
    return client;
  } catch (err) {
    console.warn('[Auto-Retrieve MCP] Failed to connect:', err.message);
    return null;
  }
}

/**
 * Calls the auto_retrieve tool on the gsd-qdrant server
 */
async function callAutoRetrieve(task, options = {}) {
  if (!client) {
    await connectToMcpServer();
    if (!client) return null;
  }
  
  try {
    const result = await client.callTool({
      name: 'auto_retrieve',
      arguments: {
        task,
        limit: options.limit ?? 3,
        maxQueries: options.maxQueries ?? 2,
        includeContent: options.includeContent ?? false,
      },
    }, undefined, { timeout: 30000 });
    
    // Parse the result
    const contentItems = result.content;
    const raw = contentItems
      .map(c => c.type === 'text' ? c.text ?? '' : JSON.stringify(c))
      .join('\n');
    
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[Auto-Retrieve MCP] Tool call failed:', err.message);
    return null;
  }
}

/**
 * Formats retrieved context for injection into the prompt
 */
function formatContext(result) {
  if (!result || !result.results || result.results.length === 0) {
    return '';
  }
  
  const lines = [
    '\n\n=== CONTESTO DA MEMORIA CROSS-PROJECT ===',
    `Task: "${result.task?.substring(0, 80) || '...'}"`,
    `Trovati ${result.results.length} risultati rilevanti:\n`,
  ];
  
  for (const hit of result.results) {
    lines.push('');
    lines.push(`• [${hit.type || 'unknown'}] ${hit.summary || hit.source}`);
    lines.push(`  Score: ${hit.relevance_score?.toFixed(3) || 'N/A'} | Source: ${hit.source}`);
    if (hit.match_type) {
      lines.push(`  Match type: ${hit.match_type}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Creates the auto-retrieve hook function
 */
function createAutoRetrieveHook(options = {}) {
  const { 
    enabled = true,
    minScoreThreshold = 0.25,
    limit = 3,
    autoConnect = true,
  } = options;
  
  if (!enabled) {
    return null;
  }
  
  return async (event, ctx) => {
    // Only trigger on user messages
    const lastUserMessage = event.payload?.messages?.[event.payload.messages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== 'user') {
      return;
    }
    
    const query = typeof lastUserMessage.content === 'string' 
      ? lastUserMessage.content 
      : JSON.stringify(lastUserMessage.content);
    
    if (!query || query.trim().length === 0) {
      return;
    }
    
    try {
      // Auto-connect if needed
      if (autoConnect && !connected) {
        await connectToMcpServer();
      }
      
      // Call auto_retrieve
      const result = await callAutoRetrieve(query, { limit });
      
      if (result && result.results && result.results.length > 0) {
        // Filter by score threshold
        const relevantResults = result.results.filter(r => 
          r.relevance_score >= minScoreThreshold
        );
        
        if (relevantResults.length > 0) {
          const contextText = formatContext(result);
          ctx.payload.messages.push({
            role: 'system',
            content: [{ type: 'text', text: contextText }],
          });
          
          console.log(`[Auto-Retrieve MCP] Added ${relevantResults.length} context items`);
        }
      }
    } catch (err) {
      // Graceful degradation
      console.warn('[Auto-Retrieve MCP] Hook execution failed:', err.message);
    }
  };
}

/**
 * Registers the auto-retrieve hook with pi
 */
export default function (pi, options = {}) {
  const hook = createAutoRetrieveHook(options);
  
  if (hook) {
    pi.on('before_provider_request', hook);
    console.log('[Auto-Retrieve MCP] Hook registered - automatic context retrieval enabled');
  } else {
    console.log('[Auto-Retrieve MCP] Hook disabled or not available');
  }
  
  // Cleanup on shutdown
  pi.on('session_shutdown', async () => {
    if (client) {
      await client.close();
      connected = false;
    }
  });
}
