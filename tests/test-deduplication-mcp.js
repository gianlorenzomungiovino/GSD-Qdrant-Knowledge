// Unit test for MCP project_id deduplication logic
// Tests the deduplication function that keeps top 2 results per project_id

// Mock the deduplication logic from src/gsd-qdrant-mcp/index.js
function deduplicateByProjectId(ranked) {
  // Deduplicate by project_id: keep top 2 results per project, then sort by score
  const projectGroups = new Map();
  for (const hit of ranked) {
    const pid = hit.project_id || '__unknown__';
    if (!projectGroups.has(pid)) projectGroups.set(pid, []);
    projectGroups.get(pid).push(hit);
  }
  const deduped = [];
  for (const [, hits] of projectGroups) {
    hits.sort((a, b) => b.score - a.score);
    deduped.push(...hits.slice(0, 2));
  }
  deduped.sort((a, b) => b.score - a.score);
  return deduped;
}

const { test } = require('node:test');
const assert = require('node:assert');

test('MCP project_id deduplication should deduplicate to top 2 results per project_id', () => {
  // Simulate results with 3+ chunks from same project_id
  const ranked = [
    { project_id: 'proj-a', score: 0.95, content: 'Content A1' },
    { project_id: 'proj-a', score: 0.87, content: 'Content A2' },
    { project_id: 'proj-a', score: 0.72, content: 'Content A3' },
    { project_id: 'proj-b', score: 0.91, content: 'Content B1' },
    { project_id: 'proj-b', score: 0.88, content: 'Content B2' },
    { project_id: 'proj-b', score: 0.75, content: 'Content B3' },
    { project_id: 'proj-c', score: 0.80, content: 'Content C1' }
  ];

  const result = deduplicateByProjectId(ranked);

  // Should have max 2 items per project
  assert.strictEqual(result.length, 5); // 2 from proj-a + 2 from proj-b + 1 from proj-c
  
  // Should contain the top 2 scores for each project
  const projAItems = result.filter(item => item.project_id === 'proj-a');
  assert.strictEqual(projAItems.length, 2);
  assert.strictEqual(projAItems[0].score, 0.95);
  assert.strictEqual(projAItems[1].score, 0.87);
  
  const projBItems = result.filter(item => item.project_id === 'proj-b');
  assert.strictEqual(projBItems.length, 2);
  assert.strictEqual(projBItems[0].score, 0.91);
  assert.strictEqual(projBItems[1].score, 0.88);
  
  const projCItems = result.filter(item => item.project_id === 'proj-c');
  assert.strictEqual(projCItems.length, 1);
  assert.strictEqual(projCItems[0].score, 0.80);
  
  // Overall should be sorted by score descending
  assert.ok(result[0].score >= result[1].score);
  assert.ok(result[1].score >= result[2].score);
  assert.ok(result[2].score >= result[3].score);
  assert.ok(result[3].score >= result[4].score);
});

test('MCP project_id deduplication should handle missing project_id correctly', () => {
  const ranked = [
    { project_id: 'proj-a', score: 0.9, content: 'Content A' },
    { score: 0.85, content: 'Content No Project' }, // Missing project_id (undefined)
    { project_id: 'proj-a', score: 0.8, content: 'Content A2' },
    { project_id: null, score: 0.75, content: 'Content Null Project' }, // Null project_id
    { project_id: '', score: 0.7, content: 'Content Empty Project' } // Empty project_id
  ];

  const result = deduplicateByProjectId(ranked);

  // Identify items that were grouped as '__unknown__' (project_id is undefined, null, or empty)
  const unknownItems = result.filter(item => !item.project_id);
  // Should keep top 2 from the unknown group (0.85 and 0.75)
  assert.strictEqual(unknownItems.length, 2);
  assert.strictEqual(unknownItems[0].score, 0.85);
  assert.strictEqual(unknownItems[1].score, 0.75);
  // The remaining item (empty string, score 0.7) should have been dropped
  const droppedUnknown = ranked.filter(item => !item.project_id).length;
  assert.strictEqual(droppedUnknown - unknownItems.length, 1, 'One unknown item should be dropped');
});

test('MCP project_id deduplication should handle single project correctly', () => {
  const ranked = [
    { project_id: 'single-proj', score: 0.9, content: 'Content 1' },
    { project_id: 'single-proj', score: 0.8, content: 'Content 2' }
  ];

  const result = deduplicateByProjectId(ranked);
  
  // Should keep both items since we allow up to 2 per project
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].project_id, 'single-proj');
  assert.strictEqual(result[1].project_id, 'single-proj');
  assert.ok(result[0].score >= result[1].score);
});

test('MCP project_id deduplication should handle no duplicates correctly', () => {
  const ranked = [
    { project_id: 'proj-a', score: 0.9, content: 'Content A' },
    { project_id: 'proj-b', score: 0.8, content: 'Content B' },
    { project_id: 'proj-c', score: 0.7, content: 'Content C' }
  ];

  const result = deduplicateByProjectId(ranked);
  
  // Should keep all items since no project has more than 2 items
  assert.strictEqual(result.length, 3);
  const projectIds = result.map(item => item.project_id).sort();
  assert.deepStrictEqual(projectIds, ['proj-a', 'proj-b', 'proj-c'].sort());
});

test('MCP project_id deduplication should handle empty input correctly', () => {
  const ranked = [];
  const result = deduplicateByProjectId(ranked);
  assert.strictEqual(result.length, 0);
});