/**
 * Related concepts module — performs a secondary Qdrant search using the
 * original user query and returns semantically related elements that were
 * not in the primary ranked set.
 *
 * Observability:
 *   Logs [related-concepts] with keyword count, secondary search result count,
 *   and filtered count.
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
 * Derive a concept name from available payload fields.
 * Priority: title (symbol/function name) > first symbolName > source basename.
 *
 * @param {Object} payload — Qdrant point payload
 * @returns {string} concept name
 */
function deriveConceptName(payload) {
  // title often contains the symbol/function/class name
  if (payload?.title && payload.title.length > 0) return payload.title;
  // symbolNames array — take the first meaningful one
  if (Array.isArray(payload?.symbolNames) && payload.symbolNames.length > 0) {
    const first = payload.symbolNames[0];
    if (typeof first === 'string' && first.length > 0) return first;
  }
  // Fallback to source basename
  const source = payload?.source || payload?.path || '';
  if (source) return basename(source, extname(source));
  return '—';
}

/**
 * Derive a description for a code element from available payload fields.
 * Extracts declaration type + signature from the code content.
 *
 * @param {Object} payload — Qdrant point payload
 * @param {string} [name] — concept name to avoid returning the same value
 * @returns {string} derived description
 */
function deriveDescription(payload, name) {
  const type = payload?.type || '';
  const summary = payload?.summary;
  const content = payload?.content;

  // If summary is genuinely descriptive (> 30 chars and different from name), use it
  if (summary && summary.length > 30 && (!name || summary.toLowerCase() !== name.toLowerCase())) {
    return summary.length > 120 ? summary.slice(0, 117) + '...' : summary;
  }

  // For code: extract declaration type + signature
  if (type.startsWith('code') && content && content.length > 0) {
    const text = content.trim();
    const lines = text.split('\n');

    // Find the first REAL declaration line (function, class, export const, etc.)
    // Skip imports, comments, blank lines, JSX, and non-declaration code
    let declLine = null;
    const declarationPatterns = [
      // JS/TS exports
      /^export\s+default\s+(async\s+)?function\b/i,
      /^export\s+(async\s+)?function\b/i,
      /^export\s+const\b/i,
      /^export\s+class\b/i,
      /^export\s+interface\b/i,
      /^export\s+type\b/i,
      // JS/TS declarations
      /^function\s+\w+/i,
      /^class\s+\w+/i,
      /^const\s+\w+\s*=\s*(async\s+)?function/i,
      /^const\s+\w+\s*=\s*\(/i,
      /^const\s+\w+\s*=\s*\{/i,
      /^const\s+\w+\s*=\s*\[/i,
      // PHP declarations
      /^function\s+\w+/i,
      /^class\s+\w+/i,
      /^namespace\s+/i,
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip blank lines, comments, JSX
      if (trimmed.length === 0) continue;
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
      if (trimmed.startsWith('</')) continue;
      // Skip import/export brace
      if (/^import\s/.test(trimmed)) continue;
      if (/^export\s+\{/.test(trimmed)) continue;
      // Skip pure attribute lines (e.g. type="button", className="...")
      if (/^\w+\s*=\s*["']/i.test(trimmed) && trimmed.length < 30) continue;
      // Check if it matches a declaration pattern
      for (const pattern of declarationPatterns) {
        if (pattern.test(trimmed)) {
          declLine = trimmed;
          break;
        }
      }
      if (declLine) break;
    }

    if (declLine) {
      // Extract declaration type prefix
      const typeMatch = declLine.match(/^(export\s+)?(default\s+)?(async\s+)?(function|const|class|interface|type)\b/);
      if (typeMatch) {
        const declType = typeMatch[4]; // function, const, class, interface, type
        // Get the signature: everything up to the first semicolon, closing brace, or 120 chars
        let signature = declLine;
        const semiIdx = signature.indexOf(';');
        const braceIdx = signature.indexOf('{');
        const arrowIdx = signature.indexOf('=>');

        if (semiIdx > 0 && semiIdx < 120) {
          signature = signature.slice(0, semiIdx);
        } else if (braceIdx > 0 && braceIdx < 120) {
          signature = signature.slice(0, braceIdx);
        } else if (arrowIdx > 0 && arrowIdx < 120) {
          signature = signature.slice(0, arrowIdx + 2);
        }

        signature = signature.replace(/\s+/g, ' ').trim();
        if (signature.length > 5) {
          return signature.length > 120 ? signature.slice(0, 117) + '...' : signature;
        }
      }
    }

    // Fallback: first meaningful line (skip attributes, short fragments)
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 15) continue;
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
      if (trimmed.startsWith('</')) continue;
      // Skip pure attribute lines (type="x", className="x", etc.)
      if (/^\w+\s*=\s*["']/i.test(trimmed)) continue;
      return trimmed.replace(/\s+/g, ' ').slice(0, 120);
    }
  }

  return '—';
}

/**
 * Perform a secondary Qdrant search to find related concepts.
 *
 * Uses the original user query to build an embedding (same local model as
 * primary search), performs a Qdrant search, filters out results overlapping
 * with primary ranked results (by source path), and returns top 5 related concepts.
 *
 * @param {Object} sync — GSDKnowledgeSync instance (has .embedText)
 * @param {string} collectionName — Qdrant collection name
 * @param {string} query — original user query
 * @param {Array<Object>} rankedResults — primary ranked results to exclude
 * @param {Object} options — search options
 * @param {string} options.vectorName — vector name (default: 'bge-m3-1024')
 * @param {number} options.limit — secondary search limit (default: 15)
 * @returns {Promise<Array<Object>>} related concepts as {name, description, source, score}
 */
async function findRelatedConcepts(sync, collectionName, query, rankedResults, options = {}) {
  const {
    vectorName = process.env.VECTOR_NAME || 'bge-m3-1024',
    limit = 15,
  } = options;

  // Extract keywords from primary results
  const keywords = extractKeywords(rankedResults);
  const keywordCount = keywords.length;

  if (keywordCount === 0) {
    return [];
  }

  // Use the ORIGINAL user query for secondary search — keywords produce
  // embeddings that don't align with stored vectors. The original query
  // produces embeddings in the same semantic space as indexed docs.
  const searchQuery = query || keywords.join(' ');

  // Build embedding from the search query using the SAME local model as primary search.
  // The Qdrant server pipeline (sync.client.pipeline) uses a different/missing embedding
  // model, producing near-zero similarity scores. Using sync.embedText() ensures both
  // primary and secondary searches operate in the same embedding space.
  let vector;
  try {
    vector = await sync.embedText(searchQuery);
  } catch (err) {
    return [];
  }

  // Perform secondary Qdrant search
  let secondaryHits;
  try {
    secondaryHits = await sync.client.search(collectionName, {
      vector: { name: vectorName, vector },
      limit: Math.max(limit * 2, 30), // prefetch-style: get more candidates
      with_payload: true,
      with_vector: false,
    });
  } catch (err) {
    return [];
  }

  const secondaryCount = secondaryHits.length;
  if (process.env.GSD_QDRANT_VERBOSE) {
    console.log(`[related-concepts] Secondary search returned ${secondaryCount} results`);
  }

  if (secondaryCount === 0) {
    return [];
  }

  // Build a set of source paths from primary results to filter out overlaps
  const primarySources = new Set();
  for (const result of rankedResults) {
    if (result?.source) primarySources.add(result.source);
    if (result?.path) primarySources.add(result.path);
  }

  if (process.env.GSD_QDRANT_VERBOSE) {
    console.log(`[related-concepts] Primary sources: ${[...primarySources].join(', ')}`);
  }

  // Filter out overlapping results and derive descriptions.
  // No threshold filter — the goal is to show related concepts as supplementary info.
  // Just skip sources already in the primary results and return top N by score.
  const related = [];
  for (const hit of secondaryHits) {
    const payload = hit.payload || {};
    const source = payload.source || payload.path || '';

    // Skip if source overlaps with primary results
    if (primarySources.has(source)) continue;

    const conceptName = deriveConceptName(payload);
    related.push({
      name: conceptName,
      description: deriveDescription(payload, conceptName),
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

  return filtered;
}

module.exports = { findRelatedConcepts };
