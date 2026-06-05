// Test to analyze deduplication differences between MCP and CLI paths

const { test } = require('node:test');
const assert = require('node:assert');

/**
 * MCP deduplication logic (from src/gsd-qdrant-mcp/index.js lines 311-320)
 * 
 * const projectGroups = new Map();
// ... populate groups ...
for (const [, hits] of projectGroups) {
  hits.sort((a, b) => b.score - a.score);
  deduped.push(...hits.slice(0, 2)); // Keep top 2 per project_id
}
// ... then sort by score and slice to limit
deduped.sort((a, b) => b.score - a.score);
deduped.slice(0, limit);
*/
function mcpDeduplicateByProjectId(results, limit) {
  const projectGroups = new Map();
  
  // Group by project_id
  for (const hit of results) {
    const pid = hit.project_id || '__unknown__';
    if (!projectGroups.has(pid)) projectGroups.set(pid, []);
    projectGroups.get(pid).push(hit);
  }
  
  const deduped = [];
  // Keep top 2 results per project
  for (const [, hits] of projectGroups) {
    hits.sort((a, b) => b.score - a.score);
    deduped.push(...hits.slice(0, 2));
  }
  
  // Sort by score descending and apply final limit
  deduped.sort((a, b) => b.score - a.score);
  return deduped.slice(0, limit);
}

/**
 * CLI grouping logic (from src/cli.js lines 570-580 and 590-600)
 * 
 * Uses searchPointGroups with group_by: 'source' and group_size: 2
 * OR fallback logic that counts per source and limits to GROUP_SIZE per source
 * 
 * NOTE: This groups by 'source', NOT by 'project_id'
 */
function cliGroupBySource(results, groupSize) {
  const sourceCounts = {};
  const groupedResults = [];
  
  // Process results in order, limiting each source to groupSize
  for (const hit of results) {
    const src = hit.payload?.source || hit.source || '__unknown__';
    if (!src || (sourceCounts[src] || 0) >= groupSize) continue;
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    groupedResults.push(hit);
  }
  
  return groupedResults;
}

// Test data simulating search results with various project_id and source combinations
const testResults = [
  { project_id: 'proj-a', source: 'file1.ts', score: 0.95, content: 'content1' },
  { project_id: 'proj-a', source: 'file2.ts', score: 0.90, content: 'content2' },
  { project_id: 'proj-a', source: 'file3.ts', score: 0.85, content: 'content3' }, // Should be excluded by MCP (3rd from proj-a)
  { project_id: 'proj-b', source: 'file1.ts', score: 0.80, content: 'content4' },
  { project_id: 'proj-b', source: 'file2.ts', score: 0.75, content: 'content5' },
  { project_id: 'proj-b', source: 'file3.ts', score: 0.70, content: 'content6' }, // Should be excluded by MCP (3rd from proj-b)
  { project_id: 'proj-c', source: 'file1.ts', score: 0.65, content: 'content7' },
  { project_id: 'proj-c', source: 'file2.ts', score: 0.60, content: 'content8' },
  { project_id: 'proj-c', source: 'file3.ts', score: 0.55, content: 'content9' }, // Should be excluded by MCP (3rd from proj-c)
];

test('MCP deduplication keeps max 2 results per project_id', async (t) => {
  const limit = 10; // High limit to see all deduplicated results
  const mcpResult = mcpDeduplicateByProjectId(testResults, limit);
  
  // Count occurrences of each project_id
  const projectCounts = {};
  for (const item of mcpResult) {
    const pid = item.project_id;
    projectCounts[pid] = (projectCounts[pid] || 0) + 1;
  }
  
  // Assert: no project_id appears more than 2 times
  for (const [pid, count] of Object.entries(projectCounts)) {
    assert.strictEqual(count <= 2, true, `Project ${pid} appears ${count} times (should be <= 2)`);
  }
  
  // Assert: we kept the highest scoring items for each project
  assert.strictEqual(mcpResult.find(item => item.project_id === 'proj-a' && item.source === 'file1.ts')?.score, 0.95);
  assert.strictEqual(mcpResult.find(item => item.project_id === 'proj-a' && item.source === 'file2.ts')?.score, 0.90);
  assert.ok(!mcpResult.find(item => item.project_id === 'proj-a' && item.source === 'file3.ts')); // Should be excluded
  
  assert.strictEqual(mcpResult.find(item => item.project_id === 'proj-b' && item.source === 'file1.ts')?.score, 0.80);
  assert.strictEqual(mcpResult.find(item => item.project_id === 'proj-b' && item.source === 'file2.ts')?.score, 0.75);
  assert.ok(!mcpResult.find(item => item.project_id === 'proj-b' && item.source === 'file3.ts')); // Should be excluded
  
  assert.strictEqual(mcpResult.find(item => item.project_id === 'proj-c' && item.source === 'file1.ts')?.score, 0.65);
  assert.strictEqual(mcpResult.find(item => item.project_id === 'proj-c' && item.source === 'file2.ts')?.score, 0.60);
  assert.ok(!mcpResult.find(item => item.project_id === 'proj-c' && item.source === 'file3.ts')); // Should be excluded
});

test('CLI group_by source limits results per source, not per project_id', async (t) => {
  const groupSize = 2;
  const cliResult = cliGroupBySource(testResults, groupSize);
  
  // Count occurrences of each source
  const sourceCounts = {};
  for (const item of cliResult) {
    const src = item.payload?.source || item.source;
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }
  
  // Assert: no source appears more than groupSize times
  for (const [src, count] of Object.entries(sourceCounts)) {
    assert.strictEqual(count <= groupSize, true, `Source ${src} appears ${count} times (should be <= ${groupSize})`);
  }
  
  // Assert: we can have MORE than 2 results per project_id since we group by source
  const projACount = cliResult.filter(item => item.project_id === 'proj-a').length;
  // With our test data, proj-a has 3 different sources, each allowed up to 2 results
  // But since each source only appears once in our test data, we should get all 3
  assert.strictEqual(projACount, 3, `Project A should have 3 results when grouping by source (got ${projACount})`);
  
  // Show that CLI can return more than 2 results from same project
  const projBCount = cliResult.filter(item => item.project_id === 'proj-b').length;
  assert.strictEqual(projBCount, 3, `Project B should have 3 results when grouping by source (got ${projBCount})`);
});

test('Documents the key difference: MCP deduplicates by project_id, CLI groups by source', async (t) => {
  // This test documents the difference found in the analysis
  
  // MCP: deduplicates by project_id (keeps max 2 per project_id)
  // CLI: groups by source (keeps max group_size per source, regardless of project_id)
  
  const mcpResult = mcpDeduplicateByProjectId(testResults, 10);
  const cliResult = cliGroupBySource(testResults, 2);
  
  // Verify MCP enforces project_id limit
  const mcpProjectCounts = {};
  for (const item of mcpResult) {
    const pid = item.project_id;
    mcpProjectCounts[pid] = (mcpProjectCounts[pid] || 0) + 1;
  }
  
  let mcpMaxPerProject = 0;
  for (const count of Object.values(mcpProjectCounts)) {
    if (count > mcpMaxPerProject) mcpMaxPerProject = count;
  }
  
  // Verify CLI does NOT enforce project_id limit (but does enforce source limit)
  const cliProjectCounts = {};
  for (const item of cliResult) {
    const pid = item.project_id;
    cliProjectCounts[pid] = (cliProjectCounts[pid] || 0) + 1;
  }
  
  let cliMaxPerProject = 0;
  for (const count of Object.values(cliProjectCounts)) {
    if (count > cliMaxPerProject) cliMaxPerProject = count;
  }
  
  // The key insight: MCP limits per project_id, CLI limits per source
  assert.strictEqual(mcpMaxPerProject <= 2, true, 'MCP should limit to max 2 results per project_id');
  // CLI can exceed 2 results per project_id since it groups by source
  // In our test case, each project has 3 different sources, so we can get up to 3 results per project
  assert.strictEqual(cliMaxPerProject > 2, true, 'CLI can exceed 2 results per project_id since it groups by source');
});
