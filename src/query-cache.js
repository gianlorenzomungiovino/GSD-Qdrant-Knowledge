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



/**
 * Normalize a query string for cache key generation.
 * Steps: lowercase → trim → split on whitespace/hyphens/underscores → filter empty tokens → join.
 * @param {string} query - Original user query
 * @returns {string} Normalized query suitable as a cache key
 */
function normalizeQuery(query) {
  if (typeof query !== 'string' || !query.trim()) return '';

  const normalized = query.toLowerCase().trim();
  const tokens = normalized.split(/[\s\-_]+/);
  const filtered = tokens.filter(t => t.length > 0);
  const result = filtered.join(' ');

  console.log('[cache] normalized: %s → %s', query, result); // lowercase → trim → split → filter empty → join
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

module.exports = { cache };
