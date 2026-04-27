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
    Cache.resetStats();
  });

  describe('set / get', () => {
    it('stores and retrieves a value', () => {
      Cache.set('key1', 'value1');
      expect(Cache.get('key1')).toBe('value1');
    });

    it('returns undefined for missing keys', () => {
      expect(Cache.get('nonexistent')).toBeUndefined();
    });

    it('overwrites existing key with new value and timestamp', () => {
      Cache.set('k', 'old');
      Cache.set('k', 'new');
      expect(Cache.get('k')).toBe('new');
    });

    it('stores complex objects (not just strings)', () => {
      const obj = { results: [{ id: 1 }], totalResults: 1 };
      Cache.set('query|3', obj);
      expect(Cache.get('query|3')).toEqual(obj);
    });
  });

  describe('has', () => {
    it('returns true for existing keys', () => {
      Cache.set('k', 'v');
      expect(Cache.has('k')).toBe(true);
    });

    it('returns false for missing keys', () => {
      expect(Cache.has('missing')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all entries from the store', () => {
      Cache.set('a', '1');
      Cache.set('b', '2');
      expect(Cache.store.size).toBe(2);
      Cache.clear();
      expect(Cache.store.size).toBe(0);
    });

    it('returns undefined for all keys after clear', () => {
      Cache.set('k', 'v');
      Cache.clear();
      expect(Cache.get('k')).toBeUndefined();
    });
  });

  describe('stats tracking', () => {
    it('counts hits and misses correctly', () => {
      Cache.set('k', 'v');
      Cache.get('k'); // hit
      Cache.get('missing'); // miss
      const stats = Cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('resets counters on resetStats', () => {
      Cache.set('k', 'v');
      Cache.get('k'); // hit
      Cache.resetStats();
      const stats = Cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('counts expired entries as misses', () => {
      Cache.set('k', 'v');
      // Manually expire the entry by setting timestamp in the past
      const entry = Cache.store.get('k');
      if (entry) {
        entry.timestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      }
      expect(Cache.get('k')).toBeUndefined();
      expect(Cache.getStats().misses).toBe(1);
    });
  });

  describe('max size eviction', () => {
    it('evicts oldest entry when exceeding MAX_SIZE (100)', () => {
      // Fill cache to capacity
      for (let i = 0; i < 100; i++) {
        Cache.set(`key${i}`, `value${i}`);
      }
      expect(Cache.store.size).toBe(100);

      // Adding one more should evict the oldest
      Cache.set('newKey', 'newValue');
      expect(Cache.store.size).toBe(100);
      expect(Cache.get('key0')).toBeUndefined(); // oldest evicted
      expect(Cache.get('newKey')).toBe('newValue');
    });

    it('does not exceed MAX_SIZE after multiple additions', () => {
      for (let i = 0; i < 200; i++) {
        Cache.set(`key${i}`, `value${i}`);
      }
      expect(Cache.store.size).toBeLessThanOrEqual(100);
    });
  });

  describe('cache key format', () => {
    it('uses task|limit as cache key (matching MCP integration)', () => {
      const task = 'buildCodeText';
      const limit = 3;
      const expectedKey = `${task}|${limit}`;
      Cache.set(expectedKey, { results: [] });
      expect(Cache.get(expectedKey)).toEqual({ results: [] });

      // Different key should miss
      expect(Cache.get(`${task}|5`)).toBeUndefined();
    });
  });
});
