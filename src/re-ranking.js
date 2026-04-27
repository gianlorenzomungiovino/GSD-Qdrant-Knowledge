/**
 * Re-ranking Module
 * 
 * Applies recency boost and path matching to Qdrant search results.
 * Results with recent lastModified timestamps get a +0.05 score boost,
 * and results whose source paths contain query words get an additional +0.15 boost.
 */

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

module.exports = { applyRecencyBoost };
