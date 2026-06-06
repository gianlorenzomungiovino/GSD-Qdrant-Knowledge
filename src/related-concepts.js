/**
 * Related concepts module — extracts keywords from ranked results,
 * performs a secondary Qdrant search, and returns semantically related
 * concepts that were not in the primary ranked set.
 *
 * Usage:
 *   const { extractKeywords, findRelatedConcepts } = require('./related-concepts');
 *
 * Observability:
 *   Logs [related-concepts] with keyword count, secondary search result count,
 *   and filtered count. Logs [related-docs] with GSD IDs found and doc count.
 *   Logs [retrieval] on formatting errors.
 */

const { basename, extname } = require('path');

/**
 * Extract unique keywords from ranked search results.
 *
 * Combines keywords from:
 *   - source paths (split on `/` and `.`, filter tokens ≥ 3 chars)
 *   - summary text (split on spaces, filter tokens ≥ 3 chars)
 *   - symbolNames (join with spaces)
 *   - tags (join with spaces)
 *
 * Deduplicates across all fields and limits to top 20 keywords.
 *
 * @param {Array<Object>|null|undefined} results — ranked results from primary search
 * @returns {string[]} deduplicated keyword array (lowercase, ≤ 20 items)
 */
function extractKeywords(results) {
  if (!results || !Array.isArray(results) || results.length === 0) return [];

  const keywordSet = new Set();

  for (const result of results) {
    if (!result || typeof result !== 'object') continue;

    // 1. Source paths — split on `/` and `.`, filter tokens ≥ 3 chars
    const source = result.source || result.path || '';
    if (typeof source === 'string' && source.length > 0) {
      const pathTokens = source.split(/[/\\.\-]+/);
      for (const token of pathTokens) {
        const cleaned = token.trim().toLowerCase();
        if (cleaned.length >= 3) keywordSet.add(cleaned);
      }
    }

    // 2. Summary text — split on spaces, filter tokens ≥ 3 chars
    const summary = result.summary || result.title || '';
    if (typeof summary === 'string' && summary.length > 0) {
      const summaryTokens = summary.split(/\s+/);
      for (const token of summaryTokens) {
        const cleaned = token.trim().toLowerCase();
        if (cleaned.length >= 3) keywordSet.add(cleaned);
      }
    }

    // 3. symbolNames — join with spaces
    const symbolNames = result.symbolNames || [];
    if (Array.isArray(symbolNames)) {
      for (const sym of symbolNames) {
        if (typeof sym === 'string') {
          const cleaned = sym.trim().toLowerCase();
          if (cleaned.length >= 3) keywordSet.add(cleaned);
        }
      }
    }

    // 4. Tags — join with spaces
    const tags = result.tags || [];
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        if (typeof tag === 'string') {
          const cleaned = tag.trim().toLowerCase();
          if (cleaned.length >= 3) keywordSet.add(cleaned);
        }
      }
    }
  }

  // Deduplicate and limit to top 20
  return [...keywordSet].slice(0, 20);
}

/**
 * Derive a description for a concept from available payload fields.
 * Priority: summary > first 100 chars of content > source basename.
 *
 * @param {Object} payload — Qdrant point payload
 * @returns {string} derived description
 */
function deriveDescription(payload) {
  if (payload?.summary && payload.summary.length > 0) return payload.summary;
  if (payload?.content && payload.content.length > 0) {
    return payload.content.slice(0, 100);
  }
  // Fallback to source basename
  const source = payload?.source || payload?.path || '';
  if (source) return basename(source, extname(source));
  return '—';
}

/**
 * Perform a secondary Qdrant search to find related concepts.
 *
 * Uses extractKeywords to build a search query, performs a Qdrant search
 * with configurable options, filters out results overlapping with primary
 * ranked results (by source path), and returns top 3-5 related concepts.
 *
 * @param {Object} client — QdrantClient instance
 * @param {string} collectionName — Qdrant collection name
 * @param {string} query — original user query (for logging)
 * @param {Array<Object>} rankedResults — primary ranked results to exclude
 * @param {Object} options — search options
 * @param {string} options.vectorName — vector name (default: 'bge-m3-1024')
 * @param {number} options.limit — secondary search limit (default: 15)
 * @param {number} options.threshold — similarity threshold (default: 0.50)
 * @returns {Promise<Array<Object>>} related concepts as {name, description, source, score}
 */
async function findRelatedConcepts(client, collectionName, query, rankedResults, options = {}) {
  const {
    vectorName = process.env.VECTOR_NAME || 'bge-m3-1024',
    limit = 15,
    threshold = 0.50,
  } = options;

  // Extract keywords from primary results
  const keywords = extractKeywords(rankedResults);
  const keywordCount = keywords.length;

  if (keywordCount === 0) {
    console.log(`[related-concepts] No keywords extracted from ${rankedResults?.length ?? 0} results for query "${query}"`);
    return [];
  }

  // Join keywords into a search query string
  const keywordQuery = keywords.join(' ');
  if (process.env.GSD_QDRANT_VERBOSE === '1') {
    console.log(`[related-concepts] Extracted ${keywordCount} keywords: ${keywordQuery}`);
  }

  // Build embedding from the keyword query
  let vector;
  try {
    if (client.pipeline) {
      const output = await client.pipeline(keywordQuery, { pooling: 'mean', normalize: true });
      vector = Array.from(output.data);
    } else {
      // Fallback: use placeholder embedding if pipeline not available
      vector = client.generatePlaceholderEmbedding(keywordQuery);
    }
  } catch (err) {
    console.log(`[related-concepts] Embedding failed: ${err.message}`);
    return [];
  }

  // Perform secondary Qdrant search
  let secondaryHits;
  try {
    secondaryHits = await client.search(collectionName, {
      vector: { name: vectorName, vector },
      limit: Math.max(limit * 2, 30), // prefetch-style: get more candidates
      with_payload: true,
      with_vector: false,
    });
  } catch (err) {
    console.log(`[related-concepts] Qdrant search failed: ${err.message}`);
    return [];
  }

  const secondaryCount = secondaryHits.length;

  if (secondaryCount === 0) {
    console.log(`[related-concepts] Secondary search returned 0 results for query "${query}"`);
    return [];
  }

  if (process.env.GSD_QDRANT_VERBOSE === '1') {
    console.log(`[related-concepts] Secondary search returned ${secondaryCount} results`);
  }

  // Build a set of source paths from primary results to filter out overlaps
  const primarySources = new Set();
  for (const result of rankedResults) {
    if (result?.source) primarySources.add(result.source);
    if (result?.path) primarySources.add(result.path);
  }

  // Filter out overlapping results and derive descriptions
  const related = [];
  for (const hit of secondaryHits) {
    const payload = hit.payload || {};
    const source = payload.source || payload.path || '';

    // Skip if source overlaps with primary results
    if (primarySources.has(source)) continue;

    // Apply threshold filter
    if (hit.score < threshold) continue;

    related.push({
      name: payload.summary || payload.title || deriveDescription(payload),
      description: deriveDescription(payload),
      source,
      score: hit.score,
      type: payload.type || 'unknown',
      language: payload.language || null,
      project_id: payload.project_id || null,
    });
  }

  // Sort by score descending and limit to top 5
  related.sort((a, b) => b.score - a.score);
  const filtered = related.slice(0, 5);

  console.log(`[related-concepts] ${keywordCount} keywords → ${secondaryCount} secondary results → ${filtered.length} related concepts`);

  return filtered;
}

/**
 * Find related documentation files for a code result.
 *
 * Looks for docs that share GSD IDs (M001, S01, T02, etc.) with the code result.
 *
 * @param {Object} client — QdrantClient instance
 * @param {string} collectionName — Qdrant collection name
 * @param {string} source — source path of the code result
 * @param {Object} payload — payload of the code result (for GSD ID extraction)
 * @param {Object} options — search options
 * @returns {Promise<Array<Object>>} related docs as {source, title, sharedIds, score}
 */
async function findRelatedDocs(client, collectionName, source, payload, options = {}) {
  const {
    vectorName = process.env.VECTOR_NAME || 'bge-m3-1024',
    limit = 5,
  } = options;

  // Extract GSD IDs from the code result
  const codeIds = new Set();
  if (payload?.relatedDocIds && Array.isArray(payload.relatedDocIds)) {
    for (const id of payload.relatedDocIds) {
      codeIds.add(id);
    }
  }
  // Also extract GSD IDs from the source path and content
  const textToScan = [source, payload?.content || '', payload?.summary || ''].join(' ');
  const pathIds = textToScan.match(/\b(M\d{3}|S\d{2}|T\d{2}|R\d{3}|D\d{3})\b/g) || [];
  for (const id of pathIds) codeIds.add(id);

  if (codeIds.size === 0) {
    console.log(`[related-docs] No GSD IDs found for source "${source}"`);
    return [];
  }

  const docCount = codeIds.size;
  if (process.env.GSD_QDRANT_VERBOSE === '1') {
    console.log(`[related-docs] Found ${docCount} GSD IDs for source "${source}": ${[...codeIds].join(', ')}`);
  }

  // Build a keyword query from the GSD IDs
  const idsQuery = [...codeIds].join(' ');

  // Build embedding
  let vector;
  try {
    if (client.pipeline) {
      const output = await client.pipeline(idsQuery, { pooling: 'mean', normalize: true });
      vector = Array.from(output.data);
    } else {
      vector = client.generatePlaceholderEmbedding(idsQuery);
    }
  } catch (err) {
    console.log(`[related-docs] Embedding failed: ${err.message}`);
    return [];
  }

  // Search for docs
  let hits;
  try {
    hits = await client.search(collectionName, {
      vector: { name: vectorName, vector },
      limit: Math.max(limit * 3, 15),
      with_payload: true,
      with_vector: false,
      filter: {
        must: [
          { key: 'type', match: { value: 'doc' } },
        ],
      },
    });
  } catch (err) {
    console.log(`[related-docs] Qdrant search failed: ${err.message}`);
    return [];
  }

  // Filter: only return docs that share at least one GSD ID with the code result
  const relatedDocs = [];
  for (const hit of hits) {
    const docPayload = hit.payload || {};
    const docIds = docPayload.relatedDocIds || docPayload.gsdIds || [];
    const sharedIds = docIds.filter(id => codeIds.has(id));

    if (sharedIds.length === 0) continue;

    relatedDocs.push({
      source: docPayload.source || docPayload.path || '',
      title: docPayload.title || docPayload.summary || '',
      sharedIds,
      score: hit.score,
    });
  }

  relatedDocs.sort((a, b) => b.score - a.score);
  const filtered = relatedDocs.slice(0, limit);

  console.log(`[related-docs] ${docCount} GSD IDs → ${hits.length} doc results → ${filtered.length} related docs`);

  return filtered;
}

module.exports = { extractKeywords, findRelatedConcepts, findRelatedDocs, deriveDescription };
