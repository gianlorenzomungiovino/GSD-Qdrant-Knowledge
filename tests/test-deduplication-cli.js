// Unit test for CLI context command deduplication behavior
// Verifies that runContext() groups by source file (NOT project_id)

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ─── Read and parse runContext to extract deduplication strategy ────

function analyzeDeduplicationStrategy() {
  const cliPath = path.join(__dirname, '..', 'src', 'cli.js');
  const cliSource = fs.readFileSync(cliPath, 'utf8');

  // Check for group_by configuration in runContext
  const hasGroupBySource = /group_by\s*:\s*['"]source['"]/.test(cliSource);
  const hasGroupByProjectId = /group_by\s*:\s*['"]project_id['"]/.test(cliSource);

  // Check for project_id deduplication logic
  const hasProjectIdDedup = /project_id.*dedup|dedup.*project_id|projectGroups|projectGroups\.get/.test(cliSource);

  // Check if project_id variable is set but not used for grouping
  const hasProjectIdVar = /const\s+project_id\s*=/.test(cliSource);

  return {
    groupBySource: hasGroupBySource,
    groupByProjectId: hasGroupByProjectId,
    hasProjectIdDedup: hasProjectIdDedup,
    hasProjectIdVar: hasProjectIdVar,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

test('CLI context command should group by source, NOT project_id', () => {
  const analysis = analyzeDeduplicationStrategy();

  // CLI uses group_by: 'source'
  assert.strictEqual(analysis.groupBySource, true,
    'CLI context command should use group_by: source');

  // CLI does NOT use group_by: 'project_id'
  assert.strictEqual(analysis.groupByProjectId, false,
    'CLI context command should NOT use group_by: project_id');
});

test('CLI context command should NOT have project_id deduplication logic', () => {
  const analysis = analyzeDeduplicationStrategy();

  // No project_id deduplication (no Map-based grouping by project_id)
  assert.strictEqual(analysis.hasProjectIdDedup, false,
    'CLI context command should NOT have project_id deduplication logic');
});

test('CLI context command sets project_id but only for output, not dedup', () => {
  const analysis = analyzeDeduplicationStrategy();

  // project_id variable exists (for JSON output)
  assert.strictEqual(analysis.hasProjectIdVar, true,
    'CLI context command should set project_id variable for output');

  // But it is NOT used for deduplication
  assert.strictEqual(analysis.hasProjectIdDedup, false,
    'project_id variable exists but is NOT used for deduplication');
});

test('CLI context command should use GROUP_SIZE=2 for source grouping', () => {
  const cliPath = path.join(__dirname, '..', 'src', 'cli.js');
  const cliSource = fs.readFileSync(cliPath, 'utf8');

  // GROUP_SIZE should be 2 (max 2 chunks per source file)
  const groupSizeMatch = cliSource.match(/const\s+GROUP_SIZE\s*=\s*(\d+)/);
  assert.ok(groupSizeMatch, 'CLI should define GROUP_SIZE constant');
  assert.strictEqual(parseInt(groupSizeMatch[1], 10), 2,
    'GROUP_SIZE should be 2 (max 2 chunks per source file)');
});

test('CLI context command should have fallback when searchPointGroups fails', () => {
  const cliPath = path.join(__dirname, '..', 'src', 'cli.js');
  const cliSource = fs.readFileSync(cliPath, 'utf8');

  // Should have a try/catch for searchPointGroups with fallback to search
  const hasGroupFallback = /searchPointGroups.*catch.*\.search/s.test(cliSource);
  assert.ok(hasGroupFallback,
    'CLI context command should have fallback from searchPointGroups to search');

  // Fallback should also use source-based deduplication (sourceCounts pattern)
  const fallbackSourceDedup = /sourceCounts\[src\]/.test(cliSource);
  assert.ok(fallbackSourceDedup,
    'Fallback should also use source-based deduplication (not project_id)');
});

test('CLI vs MCP deduplication gap analysis — CLI groups by source, MCP groups by project_id', () => {
  // This test documents the intentional gap between CLI and MCP paths

  const cliPath = path.join(__dirname, '..', 'src', 'cli.js');
  const mcpPath = path.join(__dirname, '..', 'src', 'gsd-qdrant-mcp', 'index.js');

  const cliSource = fs.readFileSync(cliPath, 'utf8');
  const mcpSource = fs.readFileSync(mcpPath, 'utf8');

  // CLI: group_by source
  assert.ok(/group_by\s*:\s*['"]source['"]/.test(cliSource),
    'CLI groups by source file');

  // MCP: deduplicates by project_id (uses projectGroups Map)
  assert.ok(/projectGroups/.test(mcpSource),
    'MCP deduplicates by project_id');

  // This is intentional: CLI is for local project context (source grouping makes sense),
  // MCP is for cross-project agent retrieval (project_id grouping prevents dominance).
});
