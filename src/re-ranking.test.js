const { calculateCompositeScore } = require('./re-ranking');

describe('calculateCompositeScore', () => {
  const now = Date.now();
  const recentTimestamp = now; // age = 0 days
  const oldTimestamp = now - 45 * 86400000; // age = 45 days

  it('returns correct composite score for a fresh, important, reusable, cross-project result', () => {
    const score = calculateCompositeScore({
      similarity: 1.0,
      timestamp: Date.now(),
      importance: 5,
      reusable: true,
      projectId: 'project-A',
      callerProjectId: 'project-B',
    });
    // 1.0*0.6 + 1.0*0.15 + 1.0*0.05 + 0.08 + 0.06 + 0 = 0.94
    expect(score).toBeCloseTo(0.94, 2);
  });

  it('returns correct composite score for a fresh, important, reusable, same-project result', () => {
    const score = calculateCompositeScore({
      similarity: 1.0,
      timestamp: Date.now(),
      importance: 5,
      reusable: true,
      projectId: 'project-A',
      callerProjectId: 'project-A',
    });
    // 1.0*0.6 + 1.0*0.15 + 1.0*0.05 + 0.08 + 0 + 0.04 = 0.92
    expect(score).toBeCloseTo(0.92, 2);
  });

  it('returns correct score for a stale, unimportant, non-reusable result with no project', () => {
    const score = calculateCompositeScore({
      similarity: 0.5,
      timestamp: oldTimestamp,
      importance: 1,
      reusable: false,
      projectId: null,
      callerProjectId: 'project-A',
    });
    // age = 45 days → recency = max(0, 1 - 45/30) = 0
    // 0.5*0.6 + 0*0.15 + (1/5)*0.05 + 0 + 0 + 0 = 0.30 + 0.01 = 0.31
    expect(score).toBeCloseTo(0.31, 4);
  });

  it('clamps score to 1.0 when all boosts push it above', () => {
    const score = calculateCompositeScore({
      similarity: 0.99,
      timestamp: Date.now(),
      importance: 5,
      reusable: true,
      projectId: 'X',
      callerProjectId: 'Y',
    });
    // 0.99*0.6 + ~1.0*0.15 + 1.0*0.05 + 0.08 + 0.06 + 0 ≈ 0.934
    expect(score).toBeCloseTo(0.934, 3);
  });

  it('clamps score to 0 when similarity is 0 and all boosts are absent', () => {
    const score = calculateCompositeScore({
      similarity: 0,
      timestamp: oldTimestamp,
      importance: 0,
      reusable: false,
      projectId: null,
      callerProjectId: null,
    });
    expect(score).toBe(0);
  });

  it('handles missing timestamp as age 0 (fresh)', () => {
    const score = calculateCompositeScore({
      similarity: 0.8,
      timestamp: undefined,
      importance: 3,
    });
    // timestamp undefined → uses Date.now() → recency ≈ 1.0
    // 0.8*0.6 + ~1.0*0.15 + (3/5)*0.05 = 0.48 + 0.15 + 0.03 = 0.66
    expect(score).toBeCloseTo(0.66, 2);
  });

  it('handles null similarity as 0', () => {
    const score = calculateCompositeScore({
      similarity: null,
      timestamp: Date.now(),
    });
    // sim clamped to 0, recency ≈ 1.0 → 0 + 0.15 + 0 + 0 + 0 + 0 ≈ 0.16
    expect(score).toBeCloseTo(0.16, 2);
  });

  it('handles empty object gracefully', () => {
    const score = calculateCompositeScore({});
    // similarity=0, timestamp=Date.now() → recency≈1.0, importance=1 → 0 + 0.15 + 0.01 = 0.16
    expect(score).toBeCloseTo(0.16, 2);
  });

  it('handles negative similarity gracefully', () => {
    const score = calculateCompositeScore({
      similarity: -0.5,
      timestamp: Date.now(),
    });
    // sim clamped to 0, recency ≈ 1.0 → 0 + 0.15 + 0 + 0 + 0 + 0 ≈ 0.16
    expect(score).toBeCloseTo(0.16, 2);
  });

  it('applies cross-project boost when projectIds differ', () => {
    const withCross = calculateCompositeScore({
      similarity: 0.5,
      timestamp: recentTimestamp,
      projectId: 'A',
      callerProjectId: 'B',
    });
    const withoutCross = calculateCompositeScore({
      similarity: 0.5,
      timestamp: recentTimestamp,
      projectId: 'A',
      callerProjectId: 'A',
    });
    expect(withCross - withoutCross).toBeCloseTo(0.02, 4); // 0.06 - 0.04 = 0.02
  });

  it('applies same-project boost when projectIds match', () => {
    const score = calculateCompositeScore({
      similarity: 0.5,
      timestamp: recentTimestamp,
      projectId: 'A',
      callerProjectId: 'A',
    });
    const noProject = calculateCompositeScore({
      similarity: 0.5,
      timestamp: recentTimestamp,
      projectId: null,
      callerProjectId: 'A',
    });
    expect(score - noProject).toBeCloseTo(0.04, 4); // sameProjectBoost
  });

  it('applies reusable boost', () => {
    const withReusable = calculateCompositeScore({
      similarity: 0.5,
      timestamp: recentTimestamp,
      reusable: true,
    });
    const withoutReusable = calculateCompositeScore({
      similarity: 0.5,
      timestamp: recentTimestamp,
      reusable: false,
    });
    expect(withReusable - withoutReusable).toBeCloseTo(0.08, 4);
  });

  it('recency decays correctly over time', () => {
    const now = Date.now();
    const fresh = calculateCompositeScore({
      similarity: 0,
      timestamp: now,
      importance: 0,
    });
    const oneWeekOld = calculateCompositeScore({
      similarity: 0,
      timestamp: now - 7 * 86400000,
      importance: 0,
    });
    // fresh: recency=1 → score=0.15
    // 1 week: recency=1-7/30≈0.767 → score≈0.115
    expect(fresh).toBeCloseTo(0.15, 4);
    expect(oneWeekOld).toBeCloseTo(0.115, 3);
  });

  it('importance scales linearly from 1 to 5', () => {
    const imp1 = calculateCompositeScore({
      similarity: 0,
      timestamp: oldTimestamp,
      importance: 1,
    });
    const imp5 = calculateCompositeScore({
      similarity: 0,
      timestamp: oldTimestamp,
      importance: 5,
    });
    // imp1: 0.2*0.05 = 0.01, imp5: 1.0*0.05 = 0.05
    expect(imp5 - imp1).toBeCloseTo(0.04, 4);
  });

  it('exports as a named function', () => {
    expect(typeof calculateCompositeScore).toBe('function');
  });
});
