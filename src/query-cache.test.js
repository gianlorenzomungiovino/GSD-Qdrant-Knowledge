import { describe, it, expect, beforeEach } from 'vitest';

// We need a fresh instance per test to avoid shared state pollution.
// Since the module exports a singleton, we import and reset stats each time.
let Cache;

beforeEach(() => {
  // Clear require cache so each test gets a fresh instance
  delete require.cache[require.resolve('./query-cache.js')];
  Cache = require('./query-cache.js');
});

describe('QueryCache', () => {
  beforeEach(() => {
    Cache.cache.resetStats();
  });

  describe('set / get', () => {
    it('stores and retrieves a value', () => {
      Cache.cache.set('key1', 'value1');
      expect(Cache.cache.get('key1')).toBe('value1');
    });

    it('returns undefined for missing keys', () => {
      expect(Cache.cache.get('nonexistent')).toBeUndefined();
    });

    it('overwrites existing key with new value and timestamp', () => {
      Cache.cache.set('k', 'old');
      Cache.cache.set('k', 'new');
      expect(Cache.cache.get('k')).toBe('new');
    });

    it('stores complex objects (not just strings)', () => {
      const obj = { results: [{ id: 1 }], totalResults: 1 };
      Cache.cache.set('query|3', obj);
      expect(Cache.cache.get('query|3')).toEqual(obj);
    });
  });

  describe('has', () => {
    it('returns true for existing keys', () => {
      Cache.cache.set('k', 'v');
      expect(Cache.cache.has('k')).toBe(true);
    });

    it('returns false for missing keys', () => {
      expect(Cache.cache.has('missing')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all entries from the store', () => {
      Cache.cache.set('foo', '1');
      Cache.cache.set('bar', '2');
      expect(Cache.cache.store.size).toBe(2);
      Cache.cache.clear();
      expect(Cache.cache.store.size).toBe(0);
    });

    it('returns undefined for all keys after clear', () => {
      Cache.cache.set('k', 'v');
      Cache.cache.clear();
      expect(Cache.cache.get('k')).toBeUndefined();
    });
  });

  describe('stats tracking', () => {
    it('counts hits and misses correctly', () => {
      Cache.cache.set('k', 'v');
      Cache.cache.get('k'); // hit
      Cache.cache.get('missing'); // miss
      const stats = Cache.cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('resets counters on resetStats', () => {
      Cache.cache.set('k', 'v');
      Cache.cache.get('k'); // hit
      Cache.cache.resetStats();
      const stats = Cache.cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('counts expired entries as misses', () => {
      Cache.cache.set('k', 'v');
      // Manually expire the entry by setting timestamp in the past
      const entry = Cache.cache.store.get('k');
      if (entry) {
        entry.timestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      }
      expect(Cache.cache.get('k')).toBeUndefined();
      expect(Cache.cache.getStats().misses).toBe(1);
    });
  });

  describe('max size eviction', () => {
    it('evicts oldest entry when exceeding MAX_SIZE (100)', () => {
      // Fill cache to capacity
      for (let i = 0; i < 100; i++) {
        Cache.cache.set(`key${i}`, `value${i}`);
      }
      expect(Cache.cache.store.size).toBe(100);

      // Adding one more should evict the oldest
      Cache.cache.set('newKey', 'newValue');
      expect(Cache.cache.store.size).toBe(100);
      expect(Cache.cache.get('key0')).toBeUndefined(); // oldest evicted
      expect(Cache.cache.get('newKey')).toBe('newValue');
    });

    it('does not exceed MAX_SIZE after multiple additions', () => {
      for (let i = 0; i < 200; i++) {
        Cache.cache.set(`key${i}`, `value${i}`);
      }
      expect(Cache.cache.store.size).toBeLessThanOrEqual(100);
    });
  });

  describe('cache key format', () => {
    it('uses task|limit as cache key (matching MCP integration)', () => {
      const task = 'buildCodeText';
      const limit = 3;
      const expectedKey = `${task}|${limit}`;
      Cache.cache.set(expectedKey, { results: [] });
      expect(Cache.cache.get(expectedKey)).toEqual({ results: [] });

      // Different key should miss
      expect(Cache.cache.get(`${task}|5`)).toBeUndefined();
    });
  });
});
