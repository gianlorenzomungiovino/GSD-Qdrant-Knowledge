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

// Load re-ranking utilities (applyRecencyBoost, applySymbolBoost, estimateTokens, trimResultsByTokenBudget)
const { applyRecencyBoost, applySymbolBoost, estimateTokens, trimResultsByTokenBudget } = require(path.join(__dirname, '..', 're-ranking'));

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
const VECTOR_NAME = process.env.VECTOR_NAME || 'bge-m3-1024';
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

        // Generate query embedding and search using prefetch.
        // Primary normalization happens via KNOWLEDGE.md instructions to the LLM
        // (extract 2-4 keywords before calling auto_retrieve). This code is a safety net:
        // if the LLM passes an unfiltered natural language query, we tokenize it here.
        const { detectIntent, buildQdrantFilter, extractKeywords } = require(path.join(__dirname, '..', 'intent-detector'));
        const t0 = Date.now();

        const intent = detectIntent(task);
        const qdrantFilter = buildQdrantFilter(intent);

        // Build embedding query: use keyword extraction as fallback for unfiltered queries.
        // Falls back to the raw task string if no meaningful tokens are found.
        const embeddedQuery = extractKeywords(task) || task;

        console.log(`[qdrant] auto_retrieve: original_query="${task}"`);
        console.log(`[qdrant] auto_retrieve: embedding_query="${embeddedQuery}"`);

        const vector = await sync.embedText(embeddedQuery);

        // Flat search — no grouping, so multiple snippets from the same file can appear.
        const LIMIT = 30;            // max results to return (increased for better re-ranking)
        const SCORE_THRESHOLD = 0.7; // lowered threshold so re-ranker has more candidates
        const FALLBACK_THRESHOLD = 0.55; // further lowered if too few results

        let hits = [];
        try {
          const searchConfig = {
            vector: { name: VECTOR_NAME, vector },
            limit: LIMIT * 2,  // request extra so threshold filtering still leaves enough
            score_threshold: SCORE_THRESHOLD,
            with_payload: true,
            with_vector: false,
          };
          if (qdrantFilter) {
            searchConfig.filter = qdrantFilter;
          }
          const rawHits = await sync.client.search(COLLECTION_NAME, searchConfig);
          hits = rawHits;

        } catch (searchErr) {
          console.warn('[qdrant] search failed:', searchErr.message);
        }

        // Diagnostic logging — show raw scores before threshold filtering
        const totalResults = hits.length;
        
        if (totalResults > 0) {
          // Show top-10 raw scores for debugging retrieval quality
          const sortedAll = [...hits].sort((a, b) => b.score - a.score);
          console.log(`[qdrant] auto_retrieve: total hits=${totalResults}, threshold=${SCORE_THRESHOLD.toFixed(2)}, fallback_threshold=${FALLBACK_THRESHOLD.toFixed(2)}`);
          
          // Top 10 raw scores with source paths (for diagnosing cutoff issues)
          const topN = sortedAll.slice(0, Math.min(10, totalResults));
          console.log(`[qdrant] auto_retrieve: top-${topN.length} raw scores:`);
          for (const h of topN) {
            console.log(`  score=${h.score.toFixed(4)} source="${h.payload?.source || '(none)'}" project="${h.payload?.project_id || '(none)'}"`);
          }

          // Count results at each threshold level to diagnose cutoff behavior
          const abovePrimary = hits.filter(h => h.score >= SCORE_THRESHOLD).length;
          const aboveFallback = hits.filter(h => h.score >= FALLBACK_THRESHOLD).length;
          
          if (abovePrimary === 0 && totalResults > 0) {
            console.log(`[qdrant] auto_retrieve: ⚠️ ZERO results at threshold ${SCORE_THRESHOLD.toFixed(2)} — all scores below cutoff`);
            const maxScore = sortedAll[0]?.score || 0;
            console.log(`[qdrant] auto_retrieve: highest score is ${maxScore.toFixed(4)}, gap to threshold=${(SCORE_THRESHOLD - maxScore).toFixed(4)}`);
          } else if (abovePrimary < 2 && totalResults > 0) {
            console.log(`[qdrant] auto_retrieve: ⚠️ Only ${abovePrimary} results at threshold — will retry with fallback`);
          }
        }

        // Apply score threshold filter
        let rankedHits = hits.filter(hit => hit.score >= SCORE_THRESHOLD);

        // Fallback: if fewer than 2 results above threshold and we got some results at all, retry with lowered threshold
        if (rankedHits.length < 2 && totalResults > 0) {
           console.log(`[qdrant] auto_retrieve: fallback: only ${rankedHits.length} results above ${SCORE_THRESHOLD.toFixed(2)}, retrying with ${FALLBACK_THRESHOLD.toFixed(2)}`);
          rankedHits = hits.filter(hit => hit.score >= FALLBACK_THRESHOLD);

          // Log how many survived the fallback threshold
          console.log(`[qdrant] auto_retrieve: after fallback (${FALLBACK_THRESHOLD.toFixed(2)}): ${rankedHits.length} results`);
        }

        // Sort by Qdrant score descending (re-ranker will re-score after this)
        const sortedByQdrantScore = rankedHits.sort((a, b) => b.score - a.score);

        const elapsed = Date.now() - t0;
        console.log(`[qdrant] auto_retrieve: chunks=${totalResults} (threshold=${SCORE_THRESHOLD.toFixed(2)} → ${rankedHits.length} above), in ${elapsed}ms`);

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

        // Symbol boost: increase scores for results whose symbolNames contain query tokens
        applySymbolBoost(ranked, task);

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
