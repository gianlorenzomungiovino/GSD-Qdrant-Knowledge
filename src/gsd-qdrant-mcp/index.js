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

// Load re-ranking utilities (estimateTokens, trimResultsByTokenBudget)
const { estimateTokens, trimResultsByTokenBudget } = require(path.join(__dirname, '..', 're-ranking'));

// Load query cache for deduplicating repeated queries
const { cache: queryCache } = require(path.join(__dirname, '..', 'query-cache'));

// Read version from this package's package.json (single source of truth)
const MCP_PKG_PATH = path.join(__dirname, 'package.json');
const SERVER_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(MCP_PKG_PATH, 'utf8')).version || '0.0.0';
  } catch (_) {
    return '0.0.0';
  }
})();

// Read environment variables
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'gsd_memory';
const VECTOR_NAME = process.env.VECTOR_NAME || 'codebert-768';
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
    version: SERVER_VERSION,
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
        // Build cache key from normalized query + limit (limit affects result set)
        const cacheKey = `${task}|${limit}`;

        // Check cache first — serve repeated queries without hitting Qdrant
        const cachedResult = queryCache.get(cacheKey);
        if (cachedResult !== undefined) {
          console.log(`[cache] hit: ${cacheKey} → serving from cache`);
          return { content: [{ type: 'text', text: JSON.stringify(cachedResult) }] };
        }

        // Initialize Knowledge Sync
        const sync = new GSDKnowledgeSync();
        await sync.init();

        // Generate query embedding and search using prefetch
        const t0 = Date.now();
        const vector = await sync.embedText(task);

        // Detect search intent and build Qdrant filter from certain filters (must)
        // vs uncertain ones (should). This ensures language/type/project constraints
        // are applied as hard must-clauses when the intent is confident.
        const { detectIntent, buildQdrantFilter } = require(path.join(__dirname, '..', 'intent-detector'));
        const intent = detectIntent(task);
        const qdrantFilter = buildQdrantFilter(intent);

        // Grouped search: return max GROUP_SIZE chunks per source document.
        const GROUP_SIZE = 2;        // max chunks per source document
        const LIMIT = 5;             // max results to return
        const SCORE_THRESHOLD = 0.85;  // minimum score for inclusion
        const FALLBACK_THRESHOLD = 0.75; // lowered threshold if too few results

        let hits = [];
        let groupCount = 0;
        try {
          const groupConfig = {
            vector: { name: VECTOR_NAME, vector },
            group_by: 'source',
            group_size: GROUP_SIZE,
            limit: LIMIT * 3,  // request more groups so we can filter by threshold after
            score_threshold: SCORE_THRESHOLD,
            with_payload: true,
            with_vector: false,
          };
          if (qdrantFilter) {
            groupConfig.filter = qdrantFilter;
          }
          const groupedResults = await sync.client.searchPointGroups(COLLECTION_NAME, groupConfig);
          groupCount = groupedResults.groups.length;

          // Flatten groups into a single hits array
          for (const group of groupedResults.groups) {
            hits = hits.concat(group.hits);
          }
        } catch (groupErr) {
          // Fallback: plain search with client-side dedup
          console.warn('[qdrant] searchPointGroups failed, falling back to search');
          try {
            const searchConfig = {
              vector: { name: VECTOR_NAME, vector },
              limit: LIMIT * 10,
              score_threshold: SCORE_THRESHOLD,
              with_payload: true,
              with_vector: false,
            };
            if (qdrantFilter) {
              searchConfig.filter = qdrantFilter;
            }
            const rawHits = await sync.client.search(COLLECTION_NAME, searchConfig);

            // Client-side dedup: max GROUP_SIZE per source document
            const sourceCounts = {};
            for (const hit of rawHits) {
              const src = hit.payload && hit.payload.source;
              if (!src || (sourceCounts[src] || 0) >= GROUP_SIZE) continue;
              sourceCounts[src] = (sourceCounts[src] || 0) + 1;
              hits.push(hit);
            }
            groupCount = Object.keys(sourceCounts).length;
          } catch (searchErr) {
            console.warn('[qdrant] search also failed, returning empty:', searchErr.message);
          }
        }

        // Log totals before threshold filtering
        const totalResults = hits.length;
        console.log('[qdrant] auto_retrieve: results: %d total, %d above threshold', totalResults, hits.filter(h => h.score >= SCORE_THRESHOLD).length);

        // Apply score threshold filter
        let rankedHits = hits.filter(hit => hit.score >= SCORE_THRESHOLD);

        // Fallback: if fewer than 2 results above threshold, retry with lowered threshold
        if (rankedHits.length < 2 && totalResults > 0) {
           console.log(`[qdrant] auto_retrieve: fallback: only ${rankedHits.length} results above ${SCORE_THRESHOLD.toFixed(2)}, retrying with ${FALLBACK_THRESHOLD.toFixed(2)}`);
          rankedHits = hits.filter(hit => hit.score >= FALLBACK_THRESHOLD);
        }

        // Sort by Qdrant score descending
        const sortedByQdrantScore = rankedHits.sort((a, b) => b.score - a.score);

        const elapsed = Date.now() - t0;
        console.log(`[qdrant] auto_retrieve: groups=${groupCount}, chunks=${totalResults} (threshold=${SCORE_THRESHOLD.toFixed(2)} → ${rankedHits.length} above), in ${elapsed}ms`);

        const projectId = PROJECT_ROOT.split(/[/\\]/).pop();

        // Rank results prioritizing cross-project reuse without excluding current project results.
        // Use threshold-filtered hits (sortedByQdrantScore) instead of raw hits.
        const ranked = sortedByQdrantScore.map(hit => {
          const recencyScore = Math.min(1, (Date.now() - hit.payload.timestamp) / (30 * 24 * 60 * 60 * 1000));
          const importanceScore = (hit.payload.importance || 1) / 5;
          const reusableBoost = hit.payload.reusable ? 0.08 : 0;
          const crossProjectBoost = hit.payload.project_id && hit.payload.project_id !== projectId ? 0.12 : 0;
          const sameProjectBoost = hit.payload.project_id === projectId ? 0.04 : 0;
          const score = hit.score * 0.6 + (1 - recencyScore) * 0.15 + importanceScore * 0.05 + reusableBoost + crossProjectBoost + sameProjectBoost;
          return { ...hit.payload, score };
        }).slice(0, limit);

        // Token estimation: calculate total tokens across all result text fields
        let totalTokens = 0;
        for (const r of ranked) {
          if (!r) continue;
          const textFields = [r.content, r.summary, r.text].filter(Boolean);
          for (const field of textFields) {
            totalTokens += estimateTokens(field);
          }
        }

        // Trim results if over token budget (4000 tokens default)
        let trimmedInfo;
        try {
          trimmedInfo = trimResultsByTokenBudget(ranked, { maxTokens: 4000 });
        } catch (_) { /* non-fatal — proceed with untrimmed */ }

        // Clean up internal _truncated flag before output
        for (const r of ranked) {
          if (r && '_truncated' in r) delete r._truncated;
        }

        console.log(`[retrieval] ${ranked.length} results, ~${totalTokens} estimated tokens` +
          (trimmedInfo && trimmedInfo.trimmed ? `, trimmed to 500 chars per result` : ''));

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

        const cachePayload = {
          task,
          results,
          totalResults: ranked.length,
          projectId,
        };

        // Store in cache for future repeated queries
        queryCache.set(cacheKey, cachePayload);
        console.log(`[cache] stored: ${cacheKey} (${ranked.length} results)`);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(cachePayload),
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
