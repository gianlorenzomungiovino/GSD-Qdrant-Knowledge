/**
 * Re-ranking Module
 * 
 * Applies recency boost, path matching, and symbol name boosting to Qdrant search results.
 * Results with recent lastModified timestamps get a +0.05 score boost,
 * results whose source paths contain query words get an additional +0.15 boost,
 * and results containing exact token matches on symbolNames get a ×1.5 score multiplier.
 */

// Minimal stopwords set for token extraction from queries (subset of full list)
const QUERY_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'out',
  'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
  'own', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but',
  'and', 'or', 'if', 'while', 'about', 'up'
]);

/**
 * Extract meaningful tokens from a query string.
 * Steps: lowercase → split on whitespace/punctuation/hyphens/underscores → filter stopwords and short tokens.
 * @param {string} query - Original user query
 * @returns {string[]} Array of meaningful token strings (length ≥ 2)
 */
function extractTokens(query) {
  if (!query || typeof query !== 'string') return [];

  const normalized = query.toLowerCase().trim();
  const tokens = normalized.split(/[\s\-_]+/);
  return tokens.filter(t => t.length >= 2 && !QUERY_STOPWORDS.has(t));
}

/**
 * Apply symbol name boost to ranked results.
 * For each result with a `symbolNames` payload field, checks if any query token
 * appears as a substring within at least one symbolName. If so, multiplies the score by 1.5.
 * 
 * @param {Array} results - Array of result objects (mutated in place)
 * @param {string} rawQuery - Original user query for token extraction
 * @returns {Array} The same results array with updated scores
 */
function applySymbolBoost(results, rawQuery) {
  if (!results || results.length === 0 || !rawQuery || typeof rawQuery !== 'string') return results;

  const tokens = extractTokens(rawQuery);
  if (tokens.length === 0) return results;

  let boostedCount = 0;

  for (const result of results) {
    if (!result || typeof result.score !== 'number') continue;

    // Check symbolNames field in payload — expect an array of strings
    const symbols = Array.isArray(result.symbolNames) ? result.symbolNames : [];
    let matched = false;

    for (const token of tokens) {
      for (const sym of symbols) {
        if (typeof sym === 'string' && sym.toLowerCase().includes(token)) {
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (matched) {
      result.score *= 1.5;
      boostedCount++;
    }
  }

  console.log('[retrieval] symbolBoost: %d results', boostedCount);
  return results;
}

/**
 * Apply recency boost and path matching to ranked results.
 * 
 * @param {Array} results - Array of result objects with at least: score (number), source (string)
 *   Results may include lastModified (unix timestamp in seconds).
 *   For path matching, either pass `query` as the second param or attach `_query` on each result.
 * @param {Object|number|string} [optionsOrDays] - Either a number of days (default 30) or an options object
 * @param {string} [rawQuery] - Optional raw query string for path matching (legacy: use options.query instead)
 * @returns {Array} The same results array with updated scores (mutated in place)
 */
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

  // Determine the raw query: from explicit param, or _query on first result
  const query = (rawQuery && rawQuery.trim()) 
    ? rawQuery.trim() 
    : (results[0] && typeof results[0]._query === 'string' ? results[0]._query : '');

  const now = Date.now();
  const recentCutoffMs = now - days * 86400000;

  let totalBoost = 0;
  let boostedCount = 0;

  for (const result of results) {
    if (!result || typeof result.score !== 'number') continue;

    let boost = 0;

    // Recency boost: +0.05 if lastModified is within the configured window
    const lastMod = result.lastModified ? parseInt(result.lastModified, 10) : null;
    if (lastMod && lastMod * 1000 > recentCutoffMs) {
      boost += 0.05;
      boostedCount++;
    }

    // Path matching: +0.15 if query words appear in the source path
    if (enablePathMatch && result.source && query.length >= 3) {
      const lowerSource = String(result.source).toLowerCase();
      const words = query.split(/\s+/).filter(w => w.length >= 3);

      for (const word of words) {
        if (lowerSource.includes(word)) {
          boost += 0.15;
          break; // Only one path match bonus per result, even if multiple query words match
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

/**
 * Estimate the number of tokens in a text string.
 * Uses ~4 characters per token — a conservative approximation suitable for code/text mix.
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count (integer)
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Trim results when total estimated tokens exceed a limit.
 * Keeps top-K results and truncates each result's content to first `maxChars` chars.
 * Mutates the input array in place (adds trimmed flag, truncates text fields).
 * @param {Array} results - Array of result objects with at least: score (number), content? (string)
 * @param {Object} options
 * @param {number} [options.maxTokens=4000] - Maximum total estimated tokens allowed
 * @param {number} [options.maxCharsPerResult=500] - Max chars to keep per truncated result
 * @returns {{ trimmed: boolean, originalCount: number, finalCount: number }} Info about trimming performed
 */
function trimResultsByTokenBudget(results, options = {}) {
  const maxTokens = typeof options.maxTokens === 'number' ? options.maxTokens : 4000;
  const maxCharsPerResult = typeof options.maxCharsPerResult === 'number' ? options.maxCharsPerResult : 500;

  if (!results || results.length === 0) {
    return { trimmed: false, originalCount: 0, finalCount: 0 };
  }

  // Calculate total estimated tokens from content + summary fields
  let totalTokens = 0;
  for (const r of results) {
    if (!r) continue;
    const textFields = [r.content, r.summary, r.text].filter(Boolean);
    for (const field of textFields) {
      totalTokens += estimateTokens(field);
    }
  }

  // No trimming needed — stay under budget
  if (totalTokens <= maxTokens) {
    return { trimmed: false, originalCount: results.length, finalCount: results.length };
  }

  const originalCount = results.length;

  // Truncate content/summary fields to maxCharsPerResult and mark as truncated
  for (const r of results) {
    if (!r) continue;
    if (r.content && r.content.length > maxCharsPerResult) {
      r.content = r.content.slice(0, maxCharsPerResult);
      r._truncated = true;
    }
    // Also truncate text field if present and larger than limit
    if (r.text && r.text.length > maxCharsPerResult) {
      r.text = r.text.slice(0, maxCharsPerResult);
      r._truncated = true;
    }
  }

  return { trimmed: true, originalCount, finalCount: results.length };
}

module.exports = { applyRecencyBoost, applySymbolBoost, extractTokens, estimateTokens, trimResultsByTokenBudget };
