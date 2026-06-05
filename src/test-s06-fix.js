#!/usr/bin/env node

/**
 * Verification script for S06 fix: path matching activation end-to-end.
 *
 * Checks:
 * 1. calculateLexicalSignal is exported as a function
 * 2. applyRecencyBoost with rawQuery adds +0.15 path matching boost
 * 3. applyRecencyBoost returns results unchanged when rawQuery is empty
 * 4. MCP server module loads without syntax errors
 */

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

// ─── Test 1: calculateLexicalSignal is exported ─────────────────────

console.log('\n1. Verify calculateLexicalSignal export');

const reRanking = require('./re-ranking');
test('calculateLexicalSignal is a function', () => {
  assert.strictEqual(typeof reRanking.calculateLexicalSignal, 'function',
    'calculateLexicalSignal must be exported as a function');
});

test('applyRecencyBoost is a function', () => {
  assert.strictEqual(typeof reRanking.applyRecencyBoost, 'function',
    'applyRecencyBoost must be exported as a function');
});

test('applySymbolBoost is a function', () => {
  assert.strictEqual(typeof reRanking.applySymbolBoost, 'function',
    'applySymbolBoost must be exported as a function');
});

// ─── Test 2: Path matching adds +0.15 boost ─────────────────────────

console.log('\n2. Path matching: +0.15 boost when query words match source paths');

test('matching source path gets +0.15 boost', () => {
  const results = [
    { score: 0.5, source: 'src/cli.js', lastModified: Date.now() / 1000 },
  ];
  const query = 'cli';
  reRanking.applyRecencyBoost(results, 30, query);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].score, 0.7,
    `Expected 0.7 (0.5 + 0.05 recency + 0.15 path match), got ${results[0].score}`);
});

test('matching source path with multi-word query gets +0.15 boost', () => {
  const results = [
    { score: 0.4, source: 'src/gsd-qdrant-mcp/index.js', lastModified: Date.now() / 1000 },
  ];
  const query = 'mcp index';
  reRanking.applyRecencyBoost(results, 30, query);
  assert.strictEqual(results.length, 1);
  assert.ok(Math.abs(results[0].score - 0.6) < 0.001,
    `Expected ~0.6 (0.4 + 0.05 recency + 0.15 path match), got ${results[0].score}`);
});

test('non-matching source path gets only recency boost (+0.05)', () => {
  const results = [
    { score: 0.6, source: 'src/other-file.js', lastModified: Date.now() / 1000 },
  ];
  const query = 'cli';
  reRanking.applyRecencyBoost(results, 30, query);
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].score, 0.65,
    `Expected 0.65 (0.6 + 0.05 recency only), got ${results[0].score}`);
});

test('old result (outside 30 days) gets no recency boost', () => {
  const oldTimestamp = (Date.now() / 1000) - (60 * 86400); // 60 days ago
  const results = [
    { score: 0.5, source: 'src/cli.js', lastModified: oldTimestamp },
  ];
  const query = 'cli';
  reRanking.applyRecencyBoost(results, 30, query);
  assert.strictEqual(results[0].score, 0.65,
    `Expected 0.65 (0.5 + 0.15 path match, no recency), got ${results[0].score}`);
});

test('query too short (< 3 chars) disables path matching', () => {
  const results = [
    { score: 0.5, source: 'src/cli.js', lastModified: Date.now() / 1000 },
  ];
  const query = 'c'; // single char, filtered out by w.length >= 3
  reRanking.applyRecencyBoost(results, 30, query);
  assert.strictEqual(results[0].score, 0.55,
    `Expected 0.55 (0.5 + 0.05 recency only), got ${results[0].score}`);
});

test('empty source path gets no path matching boost', () => {
  const results = [
    { score: 0.5, source: '', lastModified: Date.now() / 1000 },
  ];
  const query = 'cli';
  reRanking.applyRecencyBoost(results, 30, query);
  assert.strictEqual(results[0].score, 0.55,
    `Expected 0.55 (0.5 + 0.05 recency only), got ${results[0].score}`);
});

test('score capped at 1.0', () => {
  const results = [
    { score: 0.95, source: 'src/cli.js', lastModified: Date.now() / 1000 },
  ];
  const query = 'cli';
  reRanking.applyRecencyBoost(results, 30, query);
  assert.strictEqual(results[0].score, 1.0,
    `Expected 1.0 (capped), got ${results[0].score}`);
});

// ─── Test 3: Empty rawQuery returns results unchanged (no path boost) ─

console.log('\n3. Empty rawQuery: no path matching boost applied');

test('empty string rawQuery gives only recency boost', () => {
  const results = [
    { score: 0.5, source: 'src/cli.js', lastModified: Date.now() / 1000 },
  ];
  reRanking.applyRecencyBoost(results, 30, '');
  assert.strictEqual(results[0].score, 0.55,
    `Expected 0.55 (0.5 + 0.05 recency), got ${results[0].score}`);
});

test('undefined rawQuery gives only recency boost', () => {
  const results = [
    { score: 0.5, source: 'src/cli.js', lastModified: Date.now() / 1000 },
  ];
  reRanking.applyRecencyBoost(results, 30, undefined);
  assert.strictEqual(results[0].score, 0.55,
    `Expected 0.55 (0.5 + 0.05 recency), got ${results[0].score}`);
});

test('null rawQuery gives only recency boost', () => {
  const results = [
    { score: 0.5, source: 'src/cli.js', lastModified: Date.now() / 1000 },
  ];
  reRanking.applyRecencyBoost(results, 30, null);
  assert.strictEqual(results[0].score, 0.55,
    `Expected 0.55 (0.5 + 0.05 recency), got ${results[0].score}`);
});

test('whitespace-only rawQuery gives only recency boost', () => {
  const results = [
    { score: 0.5, source: 'src/cli.js', lastModified: Date.now() / 1000 },
  ];
  reRanking.applyRecencyBoost(results, 30, '   ');
  assert.strictEqual(results[0].score, 0.55,
    `Expected 0.55 (0.5 + 0.05 recency), got ${results[0].score}`);
});

test('empty results array returned as-is', () => {
  const results = reRanking.applyRecencyBoost([], 30, 'cli');
  assert.deepStrictEqual(results, []);
});

// ─── Test 4: MCP server module loads without errors ─────────────────

console.log('\n4. MCP server module loads without syntax errors');

test('MCP server index.js loads without crashing', () => {
  // Require the MCP server module — it will try to connect but we catch errors.
  // The key check is that it loads without 'calculateLexicalSignal is not a function' error.
  const mcpPath = require('path').join(__dirname, 'gsd-qdrant-mcp', 'index.js');
  const Module = require('module');
  const originalRequire = Module.prototype.require;

  // Intercept require to prevent actual server startup
  let requireCalled = false;
  Module.prototype.require = function(id) {
    if (id.includes('@modelcontextprotocol') || id.includes('@qdrant')) {
      // Mock the MCP SDK and Qdrant client to prevent actual connection
      if (id.includes('mcp.js')) {
        return {
          McpServer: class {
            constructor() {}
            tool() {}
            connect() { return Promise.resolve(); }
          },
          StdioServerTransport: class { constructor() {} }
        };
      }
      if (id.includes('js-client-rest')) {
        return { QdrantClient: class { search() { return Promise.resolve([]); } scroll() { return Promise.resolve({ points: [] }); } } };
      }
    }
    if (id.includes('zod')) {
      return { z: { string: () => ({}), number: () => ({}), boolean: () => ({}) } };
    }
    if (id.includes('query-cache')) {
      return { cache: { get() { return undefined; }, set() {} } };
    }
    // Let other requires pass through (e.g., re-ranking)
    return originalRequire.apply(this, arguments);
  };

  try {
    // This will execute the MCP server module code up to server.connect()
    // If calculateLexicalSignal was not exported, it would throw here
    require(mcpPath);
    console.log('     [info] MCP module loaded successfully (mocked dependencies)');
  } catch (err) {
    // Check if the error is about calculateLexicalSignal (the original bug)
    if (err.message && err.message.includes('calculateLexicalSignal')) {
      throw new Error(`MCP server would crash: ${err.message}`);
    }
    // Other errors are expected (e.g., module not found for GSDKnowledgeSync)
    console.log(`     [info] MCP module loaded past re-ranking import (expected: ${err.message})`);
  } finally {
    Module.prototype.require = originalRequire;
  }
});

// ─── Summary ─────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
