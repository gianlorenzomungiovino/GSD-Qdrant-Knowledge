#!/usr/bin/env node

/**
 * GSD-Qdrant MCP Server
 * 
 * MCP server per auto-retrieval di contesto da Qdrant prima di ogni risposta GSD.
 * Questo server NON tocca il codice di GSD - è un enhancer che opera esternamente.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { QdrantClient } = require('@qdrant/js-client-rest');
const crypto = require('crypto');

// Configurazione
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'gsd_memory';
const VECTOR_NAME = process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2';
const DEFAULT_LIMIT = 5;

/**
 * Estrae parole chiave significative da un task dell'utente
 * Usa pattern matching per identificare categorie comuni (autenticazione, componenti, API, ecc.)
 */
function extractKeywordsFromTask(task) {
  const lowerTask = task.toLowerCase();
  
  // Pattern per categorie comuni di entità
  const patterns = [
    /autenticazione|login|registrazione|jwt|oauth|sessione|token|password/i,
    /componente|component|widget|modulo/i,
    /hero|header|footer|layout|sidebar/i,
    /api|endpoint|request|response/i,
    /database|modello|schema|tabella/i,
    /form|input|validazione|submit/i,
  ];
  
  const keywords = [];
  
  for (const pattern of patterns) {
    const match = lowerTask.match(pattern);
    if (match) {
      // Trova la posizione del match nel task originale
      const matchIndex = lowerTask.indexOf(match[0]);
      // Trova il word completo (fino al prossimo spazio o fine stringa)
      let endPos = matchIndex + match[0].length;
      while (endPos < task.length && !/\s/.test(task[endPos])) {
        endPos++;
      }
      const originalWord = task.substring(matchIndex, endPos);
      keywords.push(originalWord);
    }
  }
  
  return [...new Set(keywords)]; // Rimuovi duplicati
}

/**
 * Genera query di ricerca ottimali dalle parole chiave estratte
 * Limita a max 2 query per evitare sovraccarico del database
 */
function generateSearchQueries(keywords) {
  if (keywords.length === 0) return ['']; // Fallback: empty array
  if (keywords.length === 1) return [keywords[0]];
  return [keywords[0], `${keywords[0]} ${keywords[1]}`]; // Max 2 query
}

/**
 * Genera embedding placeholder (fallback quando transformers non è disponibile)
 */
function generatePlaceholderEmbedding(text) {
  const hash = crypto.createHash('md5').update(text).digest('hex');
  const vector = new Array(1024).fill(0);
  for (let i = 0; i < 1024; i++) {
    const startIdx = (i * 4) % hash.length;
    const hashPart = hash.substring(startIdx, startIdx + 4) || hash.substring(0, 4);
    vector[i] = parseInt(hashPart, 16) / 0xffff;
  }
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0 && !Number.isNaN(norm)) {
    for (let i = 0; i < 1024; i++) vector[i] /= norm;
  }
  return vector;
}

/**
 * Crea l'MCP server con gli strumenti per il knowledge sharing
 */
function createServer() {
  const server = new McpServer({
    name: 'gsd-qdrant-knowledge',
    version: '2.0.0'
  });

  // Strumento: retrieve_context
  // Cerca contesto rilevante da Qdrant per una query data
  server.tool(
    'retrieve_context',
    'Ricerca contesto rilevante dalla memoria unificata GSD-Qdrant per una query specifica.',
    {
      query: z.string().describe('La query dell\'utente da cercare nella memoria'),
      limit: z.number().default(DEFAULT_LIMIT).describe('Numero massimo di risultati (default: 5)'),
      projectId: z.string().optional().describe('Project ID per filtrare risultati specifici (opzionale)'),
      includeContent: z.boolean().default(true).describe('Includere il contenuto completo nei risultati'),
    },
    async ({ query, limit, projectId, includeContent }) => {
      try {
        const client = new QdrantClient({ url: QDRANT_URL });
        
        // Genera embedding per la query
        const embedding = await generatePlaceholderEmbedding(query);
        
        // Query a Qdrant
        const hits = await client.search(COLLECTION_NAME, {
          vector: { name: VECTOR_NAME, vector: embedding },
          limit: parseInt(limit, 10),
          with_payload: true,
          with_vector: false
        });

        // Filtra per project_id se specificato
        let filtered = hits;
        if (projectId) {
          filtered = hits.filter(h => h.payload.project_id === projectId);
        }

        // Formatta risultati
        const results = filtered.map(hit => {
          const payload = hit.payload;
          return {
            id: String(hit.id),
            score: hit.score,
            type: payload.type || 'unknown',
            subtype: payload.subtype || null,
            project_id: payload.project_id || 'unknown',
            source: payload.source || 'unknown',
            summary: payload.summary || payload.source || 'No summary',
            content: includeContent ? payload.content : null,
            tags: payload.tags || [],
            language: payload.language || null,
            reusable: payload.reusable || false,
            importance: payload.importance || 1,
            timestamp: payload.timestamp || null
          };
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query,
                results,
                totalFound: results.length,
                filteredByProject: !!projectId
              }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Error retrieving context: ${err.message}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Strumento: auto_retrieve
  // Ricerca automatica di contesto rilevante dal database Qdrant basandosi sul task dell'utente
  server.tool(
    'auto_retrieve',
    'Ricerca automatica di contesto rilevante dal database Qdrant basandosi sul task dell\'utente. Restituisce solo metadata per non sovraccaricare il contesto.',
    {
      task: z.string().describe('Il task dell\'utente da analizzare'),
      limit: z.number().default(3).describe('Numero massimo di risultati (default: 3)'),
      maxQueries: z.number().default(2).describe('Numero massimo di query (default: 2)'),
      includeContent: z.boolean().default(false).describe('Includere contenuto completo? (default: false)'),
    },
    async ({ task, limit, maxQueries, includeContent }) => {
      try {
        const client = new QdrantClient({ url: QDRANT_URL });
        
        // Estrai parole chiave dal task
        const keywords = extractKeywordsFromTask(task);
        console.error(`[GSD-Qdrant MCP] Estratte ${keywords.length} parole chiave:`, keywords);
        
        // Genera query di ricerca (max maxQueries)
        const queries = generateSearchQueries(keywords).slice(0, maxQueries);
        console.error(`[GSD-Qdrant MCP] Query generate:`, queries);
        
        // Esegui retrieval per ogni query
        const allResults = [];
        let vectorScoreSum = 0;
        let textScoreSum = 0;
        let vectorCount = 0;
        let textCount = 0;
        
        for (const query of queries) {
          // === VECTOR MATCHING ===
          const embedding = await generatePlaceholderEmbedding(query);
          
          const vectorHits = await client.search(COLLECTION_NAME, {
            vector: { name: VECTOR_NAME, vector: embedding },
            limit: parseInt(limit, 10),
            with_payload: true,
            with_vector: false
          });
          
          const vectorResults = vectorHits.map(hit => ({
            ...hit.payload,
            matchType: 'vector',
            originalScore: hit.score
          }));
          
          vectorScoreSum += vectorHits.reduce((sum, h) => sum + h.score, 0);
          vectorCount += vectorHits.length;
          allResults.push(...vectorResults);
          
          // === TEXT MATCHING (full-text search on source field) ===
          // Use Qdrant's full-text search via the 'text' vector name
          // This searches the indexed text fields in the collection
          let textHits = [];
          try {
            textHits = await client.search(COLLECTION_NAME, {
              vector: 'text', // Full-text search vector name
              limit: parseInt(limit, 10),
              with_payload: true,
              with_vector: false,
              query: query // Full-text search query
            });
          } catch (textErr) {
            // If text search fails (field not indexed), fall back to empty results
            console.error(`[GSD-Qdrant MCP] Text search failed (field may not be indexed): ${textErr.message}`);
            textHits = [];
          }
          
          const textResults = textHits.map(hit => ({
            ...hit.payload,
            matchType: 'text',
            originalScore: hit.score
          }));
          
          textScoreSum += textHits.reduce((sum, h) => sum + h.score, 0);
          textCount += textHits.length;
          allResults.push(...textResults);
        }
        
        // Log del confronto tra vector e text matching
        const totalScore = vectorScoreSum + textScoreSum;
        const vectorPercentage = totalScore > 0 ? (vectorScoreSum / totalScore * 100) : 0;
        const textPercentage = totalScore > 0 ? (textScoreSum / totalScore * 100) : 0;
        
        let dominantMatchType = 'balanced';
        if (vectorPercentage > textPercentage + 20) {
          dominantMatchType = 'vector';
        } else if (textPercentage > vectorPercentage + 20) {
          dominantMatchType = 'text';
        }
        
        console.error(`[GSD-Qdrant MCP] Matching Analysis:`);
        console.error(`  - Vector matches: ${vectorCount}, avg score: ${vectorCount > 0 ? (vectorScoreSum / vectorCount).toFixed(3) : 'N/A'}`);
        console.error(`  - Text matches: ${textCount}, avg score: ${textCount > 0 ? (textScoreSum / textCount).toFixed(3) : 'N/A'}`);
        console.error(`  - Dominant match type: ${dominantMatchType} (${vectorPercentage.toFixed(1)}% vector, ${textPercentage.toFixed(1)}% text)`);
        
        // Rimuovi duplicati basati su ID
        const uniqueResults = [...new Map(allResults.map(item => [item.id, item])).values()];
        
        // Ordina per score decrescente
        uniqueResults.sort((a, b) => (b.score || 0) - (a.score || 0));
        
        // Limita il numero totale di risultati restituiti
        const finalResults = uniqueResults.slice(0, limit);
        
        // Formatta risultati: includi contenuto completo solo per il top-1
        const formattedResults = finalResults.map((result, index) => {
          const formatted = {
            id: result.id,
            source: result.source,
            summary: result.summary,
            relevance_score: result.score,
            match_type: result.matchType,
            type: result.type,
            subtype: result.subtype,
          };
          
          // Include contenuto solo per il primo risultato
          if (index === 0 && includeContent) {
            formatted.content = result.content;
          }
          
          return formatted;
        });
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              task,
              keywords,
              queries,
              results: formattedResults,
              totalFound: formattedResults.length,
              retrievalStrategy: 'auto-retrieve (limited context)',
              matchingAnalysis: {
                dominantType: dominantMatchType,
                vectorPercentage: vectorPercentage.toFixed(1),
                textPercentage: textPercentage.toFixed(1),
                vectorMatches: vectorCount,
                textMatches: textCount
              },
              note: 'Only metadata and summary included. Set includeContent=true to get full content.'
            }, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: `Error in auto-retrieve: ${err.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Strumento: list_projects
  // Restituisce la lista dei progetti indicizzati
  server.tool(
    'list_projects',
    'Restituisce la lista dei progetti unici indicizzati nella memoria GSD-Qdrant.',
    {},
    async () => {
      try {
        const client = new QdrantClient({ url: QDRANT_URL });
        
        // Scroll through all points to collect unique project_ids
        const allPoints = [];
        let offset = undefined;
        const batchSize = 1000;
        
        do {
          const result = await client.scroll(COLLECTION_NAME, {
            limit: batchSize,
            offset: offset,
            with_payload: ['project_id'],
            filter: {
              must: [{
                key: 'type',
                match: {
                  value: 'doc'
                }
              }]
            }
          });
          
          allPoints.push(...result);
          offset = result.length > 0 ? result[result.length - 1].payload.project_id : undefined;
        } while (allPoints.length % batchSize === 0);

        // Extract unique project_ids
        const projectIds = new Set(allPoints.map(p => p.payload.project_id).filter(Boolean));
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                projects: Array.from(projectIds).sort(),
                totalProjects: projectIds.size
              }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing projects: ${err.message}`
            }
          ],
          isError: true
        };
      }
    }
  );

  return server;
}

// Esporta le funzioni per testing
module.exports = {
  extractKeywordsFromTask,
  generateSearchQueries,
  createServer,
};

// Avvia il server
async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  console.error('[GSD-Qdrant MCP] Server started on stdio');
}

main().catch((err) => {
  console.error('[GSD-Qdrant MCP] Fatal error:', err);
  process.exit(1);
});
