/**
 * Re-ranking Module
 *
 * Applies recency boost, path matching, and symbol/source name boosting to Qdrant search results.
 * Results with recent lastModified timestamps get a +0.05 score boost,
 * results whose source paths contain query words get an additional +0.15 boost,
 * and results containing exact token matches on symbolNames get a ×1.5 score multiplier.
 */


function extractTokens(query) {
  if (!query || typeof query !== 'string') return [];

  const normalized = query
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();

  const tokens = normalized.split(/[\s\-_/\\.]+/);
  return tokens.filter(t => t.length >= 2);
}

function sourceToTokens(source) {
  if (!source || typeof source !== 'string') return [];

  const normalized = source
    .replace(/\\/g, '/')
    .split('/')
    .join(' ')
    .replace(/\.[a-z0-9]+$/i, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();

  return normalized
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function calculateSourceTokenOverlapScore(source, queryTokens) {
  if (!source || !Array.isArray(queryTokens) || queryTokens.length === 0) return 0;

  const sourceTokens = new Set(sourceToTokens(source));
  if (sourceTokens.size === 0) return 0;

  let matched = 0;
  for (const token of queryTokens) {
    if (sourceTokens.has(token)) matched++;
  }

  if (matched === 0) return 0;
  if (matched === queryTokens.length) return 0.2;
  return 0.08 * matched;
}

function calculateLexicalSignal(result, rawQuery) {
  if (!result || typeof result.score !== 'number' || !rawQuery || typeof rawQuery !== 'string') {
    return { symbolMultiplier: 1, sourceBoost: 0, matchedSymbols: 0, matchedSourceTokens: 0 };
  }

  const tokens = extractTokens(rawQuery);
  if (tokens.length === 0) {
    return { symbolMultiplier: 1, sourceBoost: 0, matchedSymbols: 0, matchedSourceTokens: 0 };
  }

  const symbols = Array.isArray(result.symbolNames) ? result.symbolNames : [];
  let matchedSymbols = 0;

  for (const token of tokens) {
    for (const sym of symbols) {
      if (typeof sym === 'string' && sym.toLowerCase().includes(token)) {
        matchedSymbols++;
        break;
      }
    }
  }

  const sourceTokens = new Set(sourceToTokens(result.source));
  let matchedSourceTokens = 0;
  for (const token of tokens) {
    if (sourceTokens.has(token)) matchedSourceTokens++;
  }

  return {
    symbolMultiplier: matchedSymbols > 0 ? 1.5 : 1,
    sourceBoost: calculateSourceTokenOverlapScore(result.source, tokens),
    matchedSymbols,
    matchedSourceTokens,
  };
}

function applySymbolBoost(results, rawQuery) {
  if (!results || results.length === 0 || !rawQuery || typeof rawQuery !== 'string') return results;

  let boostedCount = 0;
  let sourceBoostedCount = 0;

  for (const result of results) {
    if (!result || typeof result.score !== 'number') continue;

    const signal = calculateLexicalSignal(result, rawQuery);

    if (signal.symbolMultiplier > 1) {
      result.score *= signal.symbolMultiplier;
      boostedCount++;
    }

    if (signal.sourceBoost > 0) {
      result.score = Math.min(1.0, result.score + signal.sourceBoost);
      sourceBoostedCount++;
    }
  }

  console.log('[retrieval] symbolBoost: %d results, sourceBoost: %d results', boostedCount, sourceBoostedCount);
  return results;
}

function applyRecencyBoost(results, optionsOrDays = 30, rawQuery) {
  let days;
  let enablePathMatch = true;

  if (typeof optionsOrDays === 'object') {
    days = typeof optionsOrDays.days === 'number' ? optionsOrDays.days : 30;
    enablePathMatch = optionsOrDays.pathMatch !== false;
  } else {
    days = Number(optionsOrDays) || 30;
  }

  if (!results || results.length === 0) return results;

  const query = (rawQuery && rawQuery.trim())
    ? rawQuery.trim()
    : (results[0] && typeof results[0]._query === 'string' ? results[0]._query : '');

  const now = Date.now();
  const recentCutoffMs = now - days * 86400000;

  let totalBoost = 0;

  for (const result of results) {
    if (!result || typeof result.score !== 'number') continue;

    let boost = 0;

    const lastMod = result.lastModified ? parseInt(result.lastModified, 10) : null;
    if (lastMod && lastMod * 1000 > recentCutoffMs) {
      boost += 0.05;
    }

    if (enablePathMatch && result.source && query.length >= 3) {
      const lowerSource = String(result.source).toLowerCase();
      const words = query.split(/\s+/).filter(w => w.length >= 3);

      for (const word of words) {
        if (lowerSource.includes(word.toLowerCase())) {
          boost += 0.15;
          break;
        }
      }
    }

    totalBoost += boost;
    result.score = Math.min(1.0, result.score + boost);
  }

  const avgBoost = results.length > 0 ? totalBoost / results.length : 0;
  console.log(`[rerank] ${results.length} results scored, avg boost: ${avgBoost.toFixed(3)}`);

  return results;
}

function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

function trimResultsByTokenBudget(results, options = {}) {
  const maxTokens = typeof options.maxTokens === 'number' ? options.maxTokens : 4000;
  const maxCharsPerResult = typeof options.maxCharsPerResult === 'number' ? options.maxCharsPerResult : 500;

  if (!results || results.length === 0) {
    return { trimmed: false, originalCount: 0, finalCount: 0 };
  }

  let totalTokens = 0;
  for (const r of results) {
    if (!r) continue;
    const textFields = [r.content, r.summary, r.text].filter(Boolean);
    for (const field of textFields) {
      totalTokens += estimateTokens(field);
    }
  }

  if (totalTokens <= maxTokens) {
    return { trimmed: false, originalCount: results.length, finalCount: results.length };
  }

  const originalCount = results.length;

  for (const r of results) {
    if (!r) continue;
    if (r.content && r.content.length > maxCharsPerResult) {
      r.content = r.content.slice(0, maxCharsPerResult);
      r._truncated = true;
    }
    if (r.text && r.text.length > maxCharsPerResult) {
      r.text = r.text.slice(0, maxCharsPerResult);
      r._truncated = true;
    }
  }

  return { trimmed: true, originalCount, finalCount: results.length };
}

/**
 * Sort search results: different files keep score order (desc), same file sorts by startLine asc.
 * Used by both cli.js (context command) and gsd-qdrant-mcp/index.js (auto_retrieve tool).
 * @param {Array} hits - Array of Qdrant hit objects with payload containing startLine, chunkIndex, _parent_file
 * @returns {Array} Sorted hits
 */
function sortChunksByPosition(hits) {
  return [...hits].sort((a, b) => {
    const parentIdA = a.payload?._parent_file || '';
    const parentIdB = b.payload?._parent_file || '';

    // Different files: keep score order (descending by score)
    if (parentIdA !== parentIdB) return b.score - a.score;

    // Same file: sort by startLine ascending, then chunkIndex as tiebreaker
    const lineA = a.payload?.startLine ?? 0;
    const lineB = b.payload?.startLine ?? 0;
    if (lineA !== lineB) return lineA - lineB;

    // Fallback to chunkIndex for same-line chunks
    const idxA = a.payload?.chunkIndex ?? 0;
    const idxB = b.payload?.chunkIndex ?? 0;
    return idxA - idxB;
  });
}

/**
 * Format search results for output: token estimation, trimming, and cleanup.
 * Shared logic between cli.js (context command) and gsd-qdrant-mcp/index.js (auto_retrieve).
 * @param {Array} ranked - Ranked result objects
 * @param {object} options - Configuration
 * @param {number} options.maxTokens - Token budget (default 4000)
 * @param {number} options.maxCharsPerResult - Max chars per result (default 500)
 * @returns {{ results: Array, trimmedInfo: object|null }} Formatted results and trim info
 */
function formatResultsForOutput(ranked, options = {}) {
  const maxTokens = typeof options.maxTokens === 'number' ? options.maxTokens : 4000;
  const maxCharsPerResult = typeof options.maxCharsPerResult === 'number' ? options.maxCharsPerResult : 500;

  // Token estimation
  let totalTokens = 0;
  for (const r of ranked) {
    if (!r) continue;
    const textFields = [r.content, r.summary, r.text].filter(Boolean);
    for (const field of textFields) {
      totalTokens += estimateTokens(field);
    }
  }

  // Trim results if over token budget
  let trimmedInfo = null;
  try {
    trimmedInfo = trimResultsByTokenBudget(ranked, { maxTokens, maxCharsPerResult });
  } catch (_) { /* non-fatal — proceed with untrimmed */ }

  // Clean up internal _truncated flag before output
  for (const r of ranked) {
    if (r && '_truncated' in r) delete r._truncated;
  }

  return { results: ranked, trimmedInfo, totalTokens };
}

module.exports = {
  applyRecencyBoost,
  applySymbolBoost,
  extractTokens,
  sourceToTokens,
  calculateSourceTokenOverlapScore,
  calculateLexicalSignal,
  estimateTokens,
  trimResultsByTokenBudget,
  sortChunksByPosition,
  formatResultsForOutput
};
