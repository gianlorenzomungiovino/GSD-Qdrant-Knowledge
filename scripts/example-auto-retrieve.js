#!/usr/bin/env node

/**
 * Example: Using auto_retrieve via CLI MCP
 * 
 * Questo script dimostra come usare lo strumento auto_retrieve del MCP server
 * per ottenere contesto rilevante da Qdrant basato su un task.
 * 
 * Mostra:
 * 1. Come avviare il server MCP come child process
 * 2. Come inviare una chiamata tool tramite JSON-RPC
 * 3. Come formattare e visualizzare l'output
 */

const { spawn } = require('child_process');
const path = require('path');

// Configurazione
const MCP_SERVER_PATH = path.join(__dirname, '..', 'src', 'gsd-qdrant-mcp', 'index.js');
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'gsd_memory';

/**
 * Invia una chiamata JSON-RPC al server MCP e attende la risposta
 */
function sendMcpRequest(child, request) {
  return new Promise((resolve, reject) => {
    const message = {
      jsonrpc: '2.0',
      id: request.id,
      method: request.method,
      params: request.params
    };
    
    child.stdin.write(JSON.stringify(message) + '\n');
    
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, 30000);
    
    const onData = (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            if (response.id === request.id) {
              clearTimeout(timeout);
              child.removeListener('stdout', onData);
              resolve(response);
              return;
            }
          } catch (e) {
            // Non è un JSON valido, ignora
          }
        }
      }
    };
    
    child.on('stdout', onData);
  });
}

/**
 * Formatta l'output dei risultati in modo leggibile
 */
function formatResults(results) {
  const lines = [];
  lines.push('');
  lines.push('='.repeat(60));
  lines.push('RESULTS');
  lines.push('='.repeat(60));
  
  if (!results.results || results.results.length === 0) {
    lines.push('No results found.');
    return lines.join('\n');
  }
  
  for (let i = 0; i < results.results.length; i++) {
    const r = results.results[i];
    lines.push('');
    lines.push(`[${i + 1}] ${r.source}`);
    lines.push(`    Type: ${r.type} | Subtype: ${r.subtype || 'N/A'}`);
    lines.push(`    Relevance Score: ${(r.relevance_score * 100).toFixed(2)}%`);
    lines.push(`    Match Type: ${r.match_type}`);
    lines.push(`    Summary: ${r.summary}`);
    if (r.content) {
      lines.push(`    Content preview: ${r.content.substring(0, 100)}...`);
    }
  }
  
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push(`Total results: ${results.totalFound}`);
  if (results.keywords && results.keywords.length > 0) {
    lines.push(`Keywords extracted: ${JSON.stringify(results.keywords)}`);
  }
  if (results.matchingAnalysis) {
    lines.push(`Dominant match type: ${results.matchingAnalysis.dominantType}`);
  }
  
  return lines.join('\n');
}

/**
 * Main example function
 */
async function main() {
  // Task di esempio - sostituisci con il tuo task
  const task = 'Creare un endpoint API per autenticazione JWT';
  
  console.log('');
  console.log('========================================');
  console.log('  GSD-Qdrant MCP - Auto-Retrieve Example');
  console.log('========================================');
  console.log('');
  console.log(`Task: "${task}"`);
  console.log('');
  console.log('Starting MCP server...');
  
  // Avvia il server MCP
  const child = spawn('node', [MCP_SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: {
      ...process.env,
      QDRANT_URL,
      COLLECTION_NAME
    }
  });
  
  // Attendi che il server sia pronto
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  try {
    // Invia richiesta auto_retrieve
    const response = await sendMcpRequest(child, {
      id: 1,
      method: 'tools/call',
      params: {
        name: 'auto_retrieve',
        arguments: {
          task: task,
          limit: 3,
          maxQueries: 2,
          includeContent: false
        }
      }
    });
    
    // Chiudi il server
    child.kill();
    
    if (response.error) {
      console.error('Error:', response.error.message);
      process.exit(1);
    }
    
    // Estrai e formatta i risultati
    const content = response.result.content[0].text;
    const results = JSON.parse(content);
    
    console.log(formatResults(results));
    console.log('');
    
  } catch (err) {
    child.kill();
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// Esegui l'esempio
main();
