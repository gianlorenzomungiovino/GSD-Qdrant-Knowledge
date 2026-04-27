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

  /** Get a cached value by key. Returns undefined on miss or expiry. */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      misses++;
      return undefined;
    }
    // Check TTL
    if (Date.now() - entry.timestamp > TTL_MS) {
      this.store.delete(key);
      misses++;
      console.log(`[cache] expired: ${key}`);
      return undefined;
    }
    hits++;
    return entry.value;
  }

  /** Set a value in the cache with current timestamp. Evicts oldest if at capacity. */
  set(key, value) {
    // If key already exists, update it in place (move to "recently used")
    if (this.store.has(key)) {
      this.store.set(key, { value, timestamp: Date.now() });
      return;
    }

    // Evict oldest entry if at capacity
    if (this.store.size >= MAX_SIZE) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
      console.log(`[cache] evicted: ${oldestKey} (max size=${MAX_SIZE})`);
    }

    this.store.set(key, { value, timestamp: Date.now() });
  }

  /** Check if a key exists without updating its TTL. */
  has(key) {
    const entry = this.store.get(key);
    if (!entry) return false;
    // Still respect expiry even for has()
    if (Date.now() - entry.timestamp > TTL_MS) {
      this.store.delete(key);
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

module.exports = cache;
