#!/usr/bin/env node

/**
 * GSD-QDRANT MCP Server
 * 
 * Provides MCP tools for cross-project knowledge retrieval and management.
 * This server connects to Qdrant and exposes tools for searching and retrieving
 * relevant context from the unified GSD knowledge base.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { QdrantClient } = require('@qdrant/js-client-rest');
const path = require('path');
const fs = require('fs');

// Read environment variables
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'gsd_memory';
const VECTOR_NAME = process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2';
const PROJECT_ROOT = process.cwd();

// Load the GSDKnowledgeSync module
// Strategy: try npm module resolution first (works for global/local npm installs),
// then fall back to relative paths (works for local development/symlink).
let GSDKnowledgeSync;

try {
  // 1. Try npm module resolution — works when gsd-qdrant-knowledge is installed as a dependency/peer dep
  const resolved = require.resolve('gsd-qdrant-knowledge');
  GSDKnowledgeSync = require(resolved).GSDKnowledgeSync;
} catch (npmErr) {
  try {
    // 2. Fallback: relative path from source directory
    // When running from source: src/gsd-qdrant-mcp/index.js -> ../../index.js (project root)
    const fallbackPath = path.resolve(__dirname, '..', '..');
    const indexFile = path.join(fallbackPath, 'index.js');
    if (fs.existsSync(indexFile)) {
      GSDKnowledgeSync = require(indexFile).GSDKnowledgeSync;
    } else {
      throw new Error('gsd-qdrant-knowledge not found via npm resolution or relative path');
    }
  } catch (fallbackErr) {
    console.error(
      'Failed to load GSDKnowledgeSync.\n' +
      'Install the main package: npm install -g gsd-qdrant-knowledge\n' +
      'Error:', fallbackErr.message
    );
    process.exit(1);
  }
}

/**
 * Create the MCP server instance
 */
function createMcpServer() {
  const server = new McpServer({
    name: 'gsd-qdrant-knowledge',
    version: '2.0.9',
  });

  // Tool: auto_retrieve - Automatically retrieve relevant context for a task
  server.tool(
    'auto_retrieve',
    'Automatically retrieve relevant cross-project context for the given task using semantic search.',
    {
      task: z.string().describe('The task or query to find relevant context for'),
      limit: z.number().optional().default(3).describe('Maximum number of results to return'),
      maxQueries: z.number().optional().default(2).describe('Maximum number of queries to attempt'),
      includeContent: z.boolean().optional().default(false).describe('Whether to include full content in results'),
    },
    async ({ task, limit = 3, maxQueries = 2, includeContent = false }) => {
      try {
        // Initialize Knowledge Sync
        const sync = new GSDKnowledgeSync();
        await sync.init();

        // Generate query embedding and search
        const vector = await sync.embedText(task);
        
        // Search without filter first to get top matches
        const hits = await sync.client.search(COLLECTION_NAME, { 
          vector: { name: VECTOR_NAME, vector }, 
          limit: limit * 2,
          with_payload: true, 
          with_vector: false
        });

        const projectId = PROJECT_ROOT.split(/[/\\]/).pop();

        // Rank results prioritizing cross-project reuse without excluding current project results.
        const ranked = hits.map(hit => {
          const recencyScore = Math.min(1, (Date.now() - hit.payload.timestamp) / (30 * 24 * 60 * 60 * 1000));
          const importanceScore = (hit.payload.importance || 1) / 5;
          const reusableBoost = hit.payload.reusable ? 0.08 : 0;
          const crossProjectBoost = hit.payload.project_id && hit.payload.project_id !== projectId ? 0.12 : 0;
          const sameProjectBoost = hit.payload.project_id === projectId ? 0.04 : 0;
          const score = hit.score * 0.6 + (1 - recencyScore) * 0.15 + importanceScore * 0.05 + reusableBoost + crossProjectBoost + sameProjectBoost;
          return { ...hit.payload, score };
        }).sort((a, b) => b.score - a.score).slice(0, limit);

        // Format results for MCP response
        const results = ranked.map(hit => ({
          type: hit.type,
          subtype: hit.subtype,
          project_id: hit.project_id,
          source: hit.source,
          summary: hit.summary,
          content: includeContent ? hit.content : null,
          tags: hit.tags,
          language: hit.language,
          reusable: hit.reusable,
          importance: hit.importance,
          relevance_score: hit.score,
          match_type: 'semantic',
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                task,
                results,
                totalResults: ranked.length,
                projectId,
              }),
            },
          ],
        };
      } catch (err) {
        console.error('auto_retrieve error:', err);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: err.message,
                results: [],
              }),
            },
          ],
        };
      }
    },
  );

  // Tool: list_projects - List all projects in the knowledge base
  server.tool(
    'list_projects',
    'List all unique project IDs that have been indexed in the knowledge base.',
    {},
    async () => {
      try {
        const sync = new GSDKnowledgeSync();
        await sync.init();

        // Get all documents from the collection
        const scrollResult = await sync.client.scroll(COLLECTION_NAME, {
          limit: 1000,
          with_payload: ['project_id'],
        });

        // Extract unique project IDs (scroll returns 'points', not 'hits')
        const projects = new Set();
        for (const point of scrollResult.points) {
          if (point.payload && point.payload.project_id) {
            projects.add(point.payload.project_id);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                projects: Array.from(projects),
                totalProjects: projects.size,
              }),
            },
          ],
        };
      } catch (err) {
        console.error('list_projects error:', err);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: err.message,
                projects: [],
                totalProjects: 0,
              }),
            },
          ],
        };
      }
    },
  );

  return server;
}

// Start the server
const server = createMcpServer();
const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('Failed to connect server:', err);
  process.exit(1);
});
