/**
 * Unified stopwords list (English + Italian).
 * Used by keyword extraction, token filtering, and query normalization.
 */

const STOPWORDS_EN = new Set([
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

const STOPWORDS_IT = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una',
  'del', 'dello', 'della', 'dei', 'degli', 'delle',
  'nel', 'nello', 'nella', 'nei', 'negli', 'nelle',
  'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle',
  'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  'di', 'da', 'in', 'con', 'su', 'per',
  'tra', 'fra', 'che', 'e', 'ed', 'o', 'oppure', 'ma', 'perché',
  'poiché', 'se', 'quando', 'mentre', 'come'
]);

/** Combined stopwords set (EN + IT). */
const STOPWORDS = new Set([...STOPWORDS_EN, ...STOPWORDS_IT]);

/**
 * Filter out stopwords from a token array.
 * @param {string[]} tokens - Array of lowercase tokens
 * @returns {string[]} Tokens with stopwords removed
 */
function filterStopwords(tokens) {
  return tokens.filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

module.exports = {
  STOPWORDS_EN,
  STOPWORDS_IT,
  STOPWORDS,
  filterStopwords
};
