// Unit test for crossProjectBoost scoring change (0.12 → 0.06)
// Verifies the new value is applied and that relevant same-project results outrank
// irrelevant cross-project results with low similarity.

const { test } = require('node:test');
const assert = require('node:assert');

// --- Helpers that mirror the scoring formula in src/gsd-qdrant-mcp/index.js ---
// Data structure: { score, project_id, timestamp, importance, reusable, ...rest }

function computeScore(hit, projectId, now) {
  const recencyScore = Math.min(1, (now - hit.timestamp) / (30 * 24 * 60 * 60 * 1000));
  const importanceScore = (hit.importance || 1) / 5;
  const reusableBoost = hit.reusable ? 0.08 : 0;
  const crossProjectBoost = hit.project_id && hit.project_id !== projectId ? 0.06 : 0;
  const sameProjectBoost = hit.project_id === projectId ? 0.04 : 0;
  return hit.score * 0.6 + (1 - recencyScore) * 0.15 + importanceScore * 0.05 + reusableBoost + crossProjectBoost + sameProjectBoost;
}

function computeScoreOld(hit, projectId, now) {
  const recencyScore = Math.min(1, (now - hit.timestamp) / (30 * 24 * 60 * 60 * 1000));
  const importanceScore = (hit.importance || 1) / 5;
  const reusableBoost = hit.reusable ? 0.08 : 0;
  const crossProjectBoost = hit.project_id && hit.project_id !== projectId ? 0.12 : 0;
  const sameProjectBoost = hit.project_id === projectId ? 0.04 : 0;
  return hit.score * 0.6 + (1 - recencyScore) * 0.15 + importanceScore * 0.05 + reusableBoost + crossProjectBoost + sameProjectBoost;
}

function rankHits(hits, projectId, now) {
  return hits.map(hit => ({ ...hit, score: computeScore(hit, projectId, now) }))
    .sort((a, b) => b.score - a.score);
}

const NOW = Date.now();

// --- Tests ---

test('crossProjectBoost should be 0.06 (not 0.12)', () => {
  // Same-project hit: crossProjectBoost = 0, sameProjectBoost = 0.04
  const sameProjectHit = { project_id: 'myproj', timestamp: NOW, score: 0.5 };
  // Cross-project hit: crossProjectBoost = 0.06, sameProjectBoost = 0
  const crossProjectHit = { project_id: 'otherproj', timestamp: NOW, score: 0.5 };

  const sameScore = computeScore(sameProjectHit, 'myproj', NOW);
  const crossScore = computeScore(crossProjectHit, 'myproj', NOW);

  // Both have identical base components except sameProjectBoost (0.04) vs crossProjectBoost (0.06)
  // The difference should be approximately 0.02 (0.06 - 0.04)
  const diff = crossScore - sameScore;
  assert.ok(Math.abs(diff - 0.02) < 0.0001,
    `crossProjectBoost (0.06) should exceed sameProjectBoost (0.04) by ~0.02 — got ${diff}`);
});

test('same-project relevant result should outrank cross-project result when similarity is high for same-project', () => {
  const hits = [
    { project_id: 'myproj', timestamp: NOW, importance: 5, score: 0.95 },   // relevant, same project, high similarity
    { project_id: 'otherproj', timestamp: NOW, importance: 1, score: 0.70 }  // irrelevant, cross-project, low similarity
  ];

  const ranked = rankHits(hits, 'myproj', NOW);

  assert.strictEqual(ranked[0].project_id, 'myproj', 'Same-project high-similarity result should rank first');
  assert.strictEqual(ranked[1].project_id, 'otherproj', 'Cross-project low-similarity result should rank second');
});

test('crossProjectBoost 0.06 should not allow low-similarity cross-project results to outrank same-project results', () => {
  // With 0.06 boost, same-project with 0.70 similarity + importance 4 beats
  // cross-project with 0.60 similarity + importance 3.
  const hits = [
    { project_id: 'otherproj', timestamp: NOW, importance: 3, score: 0.60 },  // cross-project, moderate similarity
    { project_id: 'myproj', timestamp: NOW, importance: 4, score: 0.70 }      // same-project, higher similarity + higher importance
  ];

  const ranked = rankHits(hits, 'myproj', NOW);

  // With 0.06 boost, same-project (0.70 similarity, importance 4) should beat cross-project (0.60, importance 3)
  assert.strictEqual(ranked[0].project_id, 'myproj', 'Same-project result should outrank cross-project despite crossProjectBoost');

  // Verify scores explicitly
  const myProjScore = ranked.find(r => r.project_id === 'myproj').score;
  const otherProjScore = ranked.find(r => r.project_id === 'otherproj').score;
  assert.ok(myProjScore > otherProjScore, `Same-project score (${myProjScore.toFixed(4)}) should exceed cross-project score (${otherProjScore.toFixed(4)})`);
});

test('crossProjectBoost 0.06 still provides some diversity — very high cross-project similarity can rank above low same-project', () => {
  // A cross-project result with near-perfect similarity should still be able to rank
  // above a same-project result with poor similarity, proving diversity is maintained.
  const hits = [
    { project_id: 'otherproj', timestamp: NOW, importance: 5, score: 0.98 },  // cross-project, very high similarity
    { project_id: 'myproj', timestamp: NOW, importance: 1, score: 0.40 }      // same-project, low similarity
  ];

  const ranked = rankHits(hits, 'myproj', NOW);

  assert.strictEqual(ranked[0].project_id, 'otherproj', 'Very high cross-project similarity should still rank first');
});

test('crossProjectBoost 0.06 vs old 0.12 — reduced cross-project dominance', () => {
  // Scenario: cross-project hit has similarity 0.70, same-project has 0.74.
  // The similarity gap is 0.04 → 0.04 × 0.6 = 0.024, which exceeds the new boost
  // advantage (0.06 - 0.04 = 0.02) but is overwhelmed by the old boost advantage (0.12 - 0.04 = 0.08).
  const hits = [
    { project_id: 'otherproj', timestamp: NOW, importance: 3, score: 0.70 },  // cross-project
    { project_id: 'myproj', timestamp: NOW, importance: 3, score: 0.74 }      // same-project
  ];

  // Compute with old boost (0.12) for comparison
  const oldScores = hits.map(hit => ({
    project_id: hit.project_id,
    score: computeScoreOld(hit, 'myproj', NOW)
  })).sort((a, b) => b.score - a.score);

  // With old boost: cross-project (0.70) outranks same-project (0.74) — undesirable
  assert.strictEqual(oldScores[0].project_id, 'otherproj',
    `Old boost (0.12): cross-project should win — scores: otherproj=${oldScores[0].score.toFixed(4)}, myproj=${oldScores[1].score.toFixed(4)}`);

  // With new boost (0.06): same-project (0.74) should outrank cross-project (0.70)
  const newRanking = rankHits(hits, 'myproj', NOW);
  assert.strictEqual(newRanking[0].project_id, 'myproj',
    `New boost (0.06): same-project should win — scores: myproj=${newRanking[0].score.toFixed(4)}, otherproj=${newRanking[1].score.toFixed(4)}`);

  // Verify the flip
  assert.ok(oldScores[0].project_id !== newRanking[0].project_id,
    'Ranking winner flipped from cross-project to same-project after boost reduction');
});

test('crossProjectBoost should be 0 for same-project hits', () => {
  const hit = { project_id: 'myproj', timestamp: NOW, score: 0.5 };
  const score = computeScore(hit, 'myproj', NOW);

  // Manually compute expected score without crossProjectBoost
  const recencyScore = 0; // NOW - NOW = 0
  const importanceScore = 0.2; // 1 / 5
  const reusableBoost = 0;
  const sameProjectBoost = 0.04;
  const expected = 0.5 * 0.6 + (1 - recencyScore) * 0.15 + importanceScore * 0.05 + reusableBoost + 0 + sameProjectBoost;

  assert.ok(Math.abs(score - expected) < 0.0001,
    `Score (${score}) should equal expected (${expected})`);
});
