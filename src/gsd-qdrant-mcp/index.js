#!/usr/bin/env node

/**
 * GSD-QDRANT MCP Server (v2.3.2+)
 *
 * Provides MCP tools for cross-project knowledge retrieval and management.
 * Reads project root from --project argument or falls back to process.cwd().
 * Configuration is read from .mcp.json in the project directory or environment variables.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { QdrantClient } = require('@qdrant/js-client-rest');
const path = require('path');
const fs = require('fs');

function getSiblingStem(source) {
  if (!source || typeof source !== 'string') return null;
  const normalized = source.replace(/\\/g, '/');
  const ext = path.extname(normalized);
  const dir = path.posix.dirname(normalized);
  const stem = path.posix.basename(normalized, ext);
  return { dir, stem, ext, key: `${dir}/${stem}` };
}

// ─── Argument parsing ────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

// ─── Configuration resolution ────────────────────────────────────────

function resolveConfig() {
  const cliArgs = parseArgs(process.argv.slice(2));
  const projectRoot = cliArgs['project'] || process.cwd();

  // Read from .mcp.json if available
  const mcpJsonPath = path.join(projectRoot, '.mcp.json');
  let envOverrides = {};
  if (fs.existsSync(mcpJsonPath)) {
    try {
      const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
      const serverConfig = mcpConfig.mcpServers?.['gsd-qdrant'];
      if (serverConfig?.env) {
        envOverrides = serverConfig.env;
      }
    } catch (_) {}
  }

  return {
    projectRoot,
    qdrantUrl: process.env.QDRANT_URL || envOverrides.QDRANT_URL || 'http://localhost:6333',
    collectionName: process.env.COLLECTION_NAME || envOverrides.COLLECTION_NAME || 'gsd_memory',
    vectorName: process.env.VECTOR_NAME || envOverrides.VECTOR_NAME || 'bge-m3-1024',
  };
}

const CONFIG = resolveConfig();

// Load re-ranking utilities
const {
  applySymbolBoost,
  calculateCompositeScore,
  calculateLexicalSignal,
  sortChunksByPosition,
  formatResultsForOutput
} = require(path.join(__dirname, '..', 're-ranking'));

// Load query cache
const { cache: queryCache } = require(path.join(__dirname, '..', 'query-cache'));

// Read version from this package's package.json
const MCP_PKG_PATH = path.join(__dirname, 'package.json');
const SERVER_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(MCP_PKG_PATH, 'utf8')).version || '0.0.0';
  } catch (_) {
    return '0.0.0';
  }
})();

// ─── Load GSDKnowledgeSync ──────────────────────────────────────────

let GSDKnowledgeSync;

try {
  // Try npm module resolution first
  const resolved = require.resolve('gsd-qdrant-knowledge');
  GSDKnowledgeSync = require(resolved).GSDKnowledgeSync;
} catch (npmErr) {
  try {
    // Fallback: relative path from source directory
    const indexFile = path.resolve(__dirname, '..', 'index.js');
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

  // Tool: auto_retrieve
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
        const cacheKey = `${task}|${limit}|${includeContent}`;
        const cachedResult = queryCache.get(cacheKey);
        if (cachedResult !== undefined) {
          console.log(`[cache] hit: ${cacheKey} → serving from cache`);
          return { content: [{ type: 'text', text: JSON.stringify(cachedResult) }] };
        }

        const sync = new GSDKnowledgeSync();
        await sync.init();

        const { detectIntent, buildQdrantFilter, extractKeywords } = require(path.join(__dirname, '..', 'intent-detector'));
        const t0 = Date.now();

        const intent = detectIntent(task);
        const qdrantFilter = buildQdrantFilter(intent);
        const embeddedQuery = extractKeywords(task) || task;

        console.log(`[qdrant] auto_retrieve: original_query="${task}"`);
        console.log(`[qdrant] auto_retrieve: embedding_query="${embeddedQuery}"`);

        const vector = await sync.embedText(embeddedQuery);

        const LIMIT = 30;
        const SCORE_THRESHOLD = 0.70;
        const FALLBACK_THRESHOLD = 0.48;

        let hits = [];
        try {
          const searchConfig = {
            vector: { name: CONFIG.vectorName, vector },
            limit: LIMIT * 2,
            with_payload: true,
            with_vector: false,
          };
          if (qdrantFilter) searchConfig.filter = qdrantFilter;
          const rawHits = await sync.client.search(CONFIG.collectionName, searchConfig);
          hits = rawHits;
        } catch (searchErr) {
          console.warn('[qdrant] search failed:', searchErr.message);
        }

        // Lexical rescue
        const rescuedHits = hits.map(hit => {
          if (!hit || typeof hit.score !== 'number') return hit;
          const payload = hit.payload || {};
          const signal = calculateLexicalSignal({
            score: hit.score,
            source: payload.source,
            symbolNames: payload.symbolNames,
          }, task);

          let lexicalBoost = 0;
          if (signal.symbolMultiplier > 1) lexicalBoost += 0.08;
          lexicalBoost += Math.min(signal.sourceBoost, 0.12);

          if (lexicalBoost <= 0) return hit;

          return {
            ...hit,
            score: Math.min(1.0, hit.score + lexicalBoost),
            _lexicalRescue: {
              lexicalBoost,
              matchedSymbols: signal.matchedSymbols,
              matchedSourceTokens: signal.matchedSourceTokens,
            }
          };
        });

        const totalResults = rescuedHits.length;

        if (totalResults > 0) {
          const sortedAll = [...rescuedHits].sort((a, b) => b.score - a.score);
          console.log(`[qdrant] auto_retrieve: total hits=${totalResults}, threshold=${SCORE_THRESHOLD.toFixed(2)}, fallback_threshold=${FALLBACK_THRESHOLD.toFixed(2)}`);

          const topN = sortedAll.slice(0, Math.min(10, totalResults));
          console.log(`[qdrant] auto_retrieve: top-${topN.length} raw scores:`);
          for (const h of topN) {
            console.log(`  score=${h.score.toFixed(4)} source="${h.payload?.source || '(none)'}" project="${h.payload?.project_id || '(none)'}"`);
          }

          const abovePrimary = rescuedHits.filter(h => h.score >= SCORE_THRESHOLD).length;
          const aboveFallback = rescuedHits.filter(h => h.score >= FALLBACK_THRESHOLD).length;

          if (abovePrimary === 0 && totalResults > 0) {
            console.log(`[qdrant] auto_retrieve: ⚠️ ZERO results at threshold ${SCORE_THRESHOLD.toFixed(2)} — all scores below cutoff`);
            const maxScore = sortedAll[0]?.score || 0;
            console.log(`[qdrant] auto_retrieve: highest score is ${maxScore.toFixed(4)}, gap to threshold=${(SCORE_THRESHOLD - maxScore).toFixed(4)}`);
          } else if (abovePrimary < 2 && totalResults > 0) {
            console.log(`[qdrant] auto_retrieve: ⚠️ Only ${abovePrimary} results at threshold — will retry with fallback`);
          }
        }

        let rankedHits = rescuedHits.filter(hit => hit.score >= SCORE_THRESHOLD);
        if (rankedHits.length < 2 && totalResults > 0) {
          console.log(`[qdrant] auto_retrieve: fallback: only ${rankedHits.length} results above ${SCORE_THRESHOLD.toFixed(2)}, retrying with ${FALLBACK_THRESHOLD.toFixed(2)}`);
          rankedHits = rescuedHits.filter(hit => hit.score >= FALLBACK_THRESHOLD);
          console.log(`[qdrant] auto_retrieve: after fallback (${FALLBACK_THRESHOLD.toFixed(2)}): ${rankedHits.length} results`);
        }

        rankedHits = sortChunksByPosition(rankedHits);

        // Sibling file expansion
        const seenSources = new Set(rankedHits.map(hit => `${hit.payload?.project_id || ''}::${hit.payload?.source || ''}`));
        const siblingKeys = new Map();
        for (const hit of rankedHits.slice(0, Math.min(5, rankedHits.length))) {
          const info = getSiblingStem(hit.payload?.source);
          if (!info) continue;
          const projectId = hit.payload?.project_id;
          if (!projectId) continue;
          siblingKeys.set(`${projectId}::${info.key}`, {
            projectId,
            dir: info.dir,
            stem: info.stem,
            baseScore: hit.score,
          });
        }

        for (const { projectId, dir, stem, baseScore } of siblingKeys.values()) {
          let offset = null;
          while (true) {
            const scroll = await sync.client.scroll(CONFIG.collectionName, {
              limit: 200,
              offset,
              with_payload: true,
              with_vector: false,
              filter: {
                must: [
                  { key: 'project_id', match: { value: projectId } },
                  { key: 'type', match: { value: 'code' } }
                ]
              }
            });

            for (const point of scroll.points) {
              const source = point.payload?.source;
              const info = getSiblingStem(source);
              if (!info) continue;
              if (info.dir !== dir || info.stem !== stem) continue;
              const key = `${projectId}::${source}`;
              if (seenSources.has(key)) continue;
              seenSources.add(key);
              rankedHits.push({ ...point, score: Math.max(point.score || 0, baseScore - 0.015) });
            }

            if (!scroll.next_page_offset) break;
            offset = scroll.next_page_offset;
          }
        }

        rankedHits = sortChunksByPosition(rankedHits);

        // ─── Always-on whitelist documentation (project context) ─────────
        // Whitelist docs (ROADMAP, CONTEXT, ASSESSMENT, UAT, etc.) are few
        // high-value files that explain GSD patterns. They provide project
        // context to the LLM regardless of the query topic — like a "project
        // awareness layer" that improves answer quality for ANY question.
        // We search for them using the original query and always include
        // the top results alongside code results.
        let contextDocs = [];
        try {
          const queryVector = await sync.embedText(task);
          const docHits = await sync.client.search(CONFIG.collectionName, {
            vector: { name: CONFIG.vectorName, vector: queryVector },
            limit: 10,
            with_payload: true,
            with_vector: false,
            filter: {
              must: [
                { key: 'type', match: { value: 'doc' } },
                { key: 'language', match: { value: 'markdown' } },
              ]
            }
          });

          // Take top docs that aren't already in results
          const existingSources = new Set(rankedHits.map(h => h.payload?.source));
          for (const point of docHits) {
            const source = point.payload?.source;
            if (!source || existingSources.has(source)) continue;
            if (point.score >= 0.40) {
              point._projectContext = true;
              point._lexicalRescue = {
                projectContext: true,
                boostReason: 'always-on-whitelist-project-context',
              };
              rankedHits.push({ ...point, score: Math.max(point.score, 0.50) });
              existingSources.add(source);
              contextDocs.push(point);
            }
          }
        } catch (docErr) {
          console.warn('[qdrant] auto_retrieve: whitelist doc search failed:', docErr.message);
        }

        const elapsed = Date.now() - t0;
        console.log(`[qdrant] auto_retrieve: chunks=${totalResults} (threshold=${SCORE_THRESHOLD.toFixed(2)} → ${rankedHits.length} above, +${contextDocs.length} project context docs), in ${elapsed}ms`);

        const projectId = CONFIG.projectRoot.split(/[/\\]/).pop();

        const ranked = rankedHits.map(hit => {
          const payload = hit.payload || {};

          // Whitelist docs as project context bypass the composite score penalty.
          // They provide project awareness to the LLM regardless of query topic.
          // We boost their importance to ensure they survive scoring.
          if (hit._projectContext && payload.type === 'doc') {
            const baseBoost = hit.score || 0.50;
            const composite = calculateCompositeScore({
              similarity: baseBoost,
              timestamp: payload.timestamp,
              importance: Math.max(payload.importance || 1, 3), // boost for whitelist docs
              reusable: payload.reusable || false,
              projectId: payload.project_id,
              callerProjectId: projectId,
            });
            // Ensure project context docs get a score that survives threshold
            const finalScore = Math.max(composite, baseBoost * 0.85);
            return { ...payload, score: finalScore, _projectContext: true };
          }

          const composite = calculateCompositeScore({
            similarity: hit.score,
            timestamp: payload.timestamp,
            importance: payload.importance || 1,
            reusable: payload.reusable || false,
            projectId: payload.project_id,
            callerProjectId: projectId,
          });
          return { ...payload, score: composite };
        });

        // Deduplicate by project_id: keep top 2 results per project, then sort by score
        const projectGroups = new Map();
        for (const hit of ranked) {
          const pid = hit.project_id || '__unknown__';
          if (!projectGroups.has(pid)) projectGroups.set(pid, []);
          projectGroups.get(pid).push(hit);
        }
        const deduped = [];
        for (const [, hits] of projectGroups) {
          hits.sort((a, b) => b.score - a.score);
          deduped.push(...hits.slice(0, 2));
        }
        deduped.sort((a, b) => b.score - a.score);

        // Separate project context docs from regular results
        const projectContextDocs = deduped.filter(h => h._projectContext);
        const regularResults = deduped.filter(h => !h._projectContext);

        // Limit project context docs to a reasonable number (max 3)
        const MAX_CONTEXT_DOCS = 3;
        const limitedContextDocs = projectContextDocs.slice(0, MAX_CONTEXT_DOCS);

        // Fill remaining slots with regular results to reach the limit
        const remainingSlots = Math.max(0, limit - limitedContextDocs.length);
        const selectedRegular = regularResults.slice(0, remainingSlots);

        // Final results: context docs first (project awareness), then code
        const finalResults = [...limitedContextDocs, ...selectedRegular];

        applySymbolBoost(finalResults, task);

        const { results: formattedResults, trimmedInfo, totalTokens } = formatResultsForOutput(finalResults, { maxTokens: 4000 });

        console.log(`[retrieval] ${formattedResults.length} results, ~${totalTokens} estimated tokens` +
          (trimmedInfo && trimmedInfo.trimmed ? `, trimmed to 500 chars per result` : ''));

        const results = formattedResults.map(hit => ({
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
          totalResults: formattedResults.length,
          projectId,
        };

        queryCache.set(cacheKey, cachePayload);
        console.log(`[cache] stored: ${cacheKey} (${formattedResults.length} results)`);

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

  // Tool: list_projects
  server.tool(
    'list_projects',
    'List all unique project IDs that have been indexed in the knowledge base.',
    {},
    async () => {
      try {
        const sync = new GSDKnowledgeSync();
        await sync.init();

        const scrollResult = await sync.client.scroll(CONFIG.collectionName, {
          limit: 1000,
          with_payload: ['project_id'],
        });

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
