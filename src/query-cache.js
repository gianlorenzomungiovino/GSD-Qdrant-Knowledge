/**
 * QueryCache — in-memory LRU cache with TTL for Qdrant query results.
 *
 * Features:
 *  - Map-backed storage with per-entry timestamps (TTL-based expiry)
 *  - Background sweep interval removes expired entries every 60 seconds
 *  - Max size of 100 entries; oldest entry evicted on overflow (LRU-ish)
 *  - Stats tracking: hits, misses for logging
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SIZE = 100;
const SWEEP_INTERVAL_MS = 60 * 1000; // sweep every 60 seconds

let hits = 0;
let misses = 0;

// Stopwords — English + Italian (union set for deduplication)
const STOPWORDS_EN = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up', 'any'
]);

const STOPWORDS_IT = new Set([
  // Articoli
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', "un'",
  // Preposizioni articolate
  'del', 'dello', 'della', 'dei', 'degli', 'delle',
  'nel', 'nello', 'nella', 'nei', 'negli', 'nelle',
  'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle',
  // Preposizioni articolate con "da" (dal, dallo...) e forme contratte
  'col', 'colla', 'coi', 'cogli', 'cole',
  'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  // Preposizioni semplici
  'di', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
  // Pronomi
  'mi', 'ti', 'ci', 'vi', 'si', 'lo', 'la', 'li', 'le', 'ne', 'gli',
  // Congiunzioni e altre
  'che', 'e', 'ed', 'o', 'oppure', 'ma', 'perché', 'poiché', 'siccome',
  'se', 'quando', 'mentre', 'dopo', 'prima', 'subito', 'appena',
  'così', 'anche', 'non', 'più', 'meno', 'troppo', 'abbastanza',
  'qui', 'quà', 'qua', 'lì', 'là', 'come', 'dove', 'dunque',
  'pertanto', 'infatti', 'cioè', 'vale', 'a dire'
]);

const STOPWORDS = new Set([...STOPWORDS_EN, ...STOPWORDS_IT]);

/**
 * Normalize a query string for cache key generation.
 * Steps: lowercase → split on whitespace/punctuation → filter stopwords → join.
 * @param {string} query - Original user query
 * @returns {string} Normalized query suitable as a cache key
 */
function normalizeQuery(query) {
  if (typeof query !== 'string' || !query.trim()) return '';

  const normalized = query.toLowerCase().trim();
  const tokens = normalized.split(/[\s\-_]+/);
  const filtered = tokens.filter(t => t.length > 0 && !STOPWORDS.has(t));
  const result = filtered.join(' ');

  console.log('[cache] normalized: %s → %s', query, result);
  return result;
}

class QueryCache {
  constructor() {
    this.store = new Map(); // key → { value, timestamp }
    this._sweepTimer = null;
    this.startSweep();
  }

  /** Start background sweep of expired entries */
  startSweep() {
    if (this._sweepTimer) return;
    this._sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    // Make the timer non-blocking so it doesn't prevent process exit
    if (this._sweepTimer.unref) this._sweepTimer.unref();
  }

  /** Remove all expired entries from the store */
  sweep() {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > TTL_MS) {
        this.store.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`[cache] sweep: removed ${removed} expired entries, remaining=${this.store.size}`);
    }
  }

  /** Get a cached value by key. Normalizes the key first for fuzzy matching. Returns undefined on miss or expiry. */
  get(key) {
    const normalized = normalizeQuery(key);
    if (!normalized) return undefined;

    const entry = this.store.get(normalized);
    if (!entry) {
      misses++;
      return undefined;
    }
    // Check TTL
    if (Date.now() - entry.timestamp > TTL_MS) {
      this.store.delete(normalized);
      misses++;
      console.log(`[cache] expired: ${normalized}`);
      return undefined;
    }
    hits++;
    return entry.value;
  }

  /** Set a value in the cache with current timestamp. Normalizes the key first. Evicts oldest if at capacity. */
  set(key, value) {
    const normalized = normalizeQuery(key);
    if (!normalized) return;

    // If key already exists, update it in place (move to "recently used")
    if (this.store.has(normalized)) {
      this.store.set(normalized, { value, timestamp: Date.now() });
      return;
    }

    // Evict oldest entry if at capacity
    if (this.store.size >= MAX_SIZE) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
      console.log(`[cache] evicted: ${oldestKey} (max size=${MAX_SIZE})`);
    }

    this.store.set(normalized, { value, timestamp: Date.now() });
  }

  /** Check if a key exists without updating its TTL. Normalizes the key first. */
  has(key) {
    const normalized = normalizeQuery(key);
    if (!normalized) return false;

    const entry = this.store.get(normalized);
    if (!entry) return false;
    // Still respect expiry even for has()
    if (Date.now() - entry.timestamp > TTL_MS) {
      this.store.delete(normalized);
      return false;
    }
    return true;
  }

  /** Clear all entries from the cache. */
  clear() {
    const size = this.store.size;
    this.store.clear();
    console.log(`[cache] cleared: ${size} entries removed`);
  }

  /** Get current stats (hits, misses, size). */
  getStats() {
    return { hits, misses, size: this.store.size };
  }

  /** Reset all counters. Useful for testing. */
  resetStats() {
    hits = 0;
    misses = 0;
  }

  /** Stop the background sweep timer. */
  stopSweep() {
    if (this._sweepTimer) {
      clearInterval(this._sweepTimer);
      this._sweepTimer = null;
    }
  }
}

// Singleton instance — shared across all imports
const cache = new QueryCache();

module.exports = { cache, normalizeQuery };
