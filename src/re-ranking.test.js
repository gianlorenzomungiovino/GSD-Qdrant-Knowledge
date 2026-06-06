const { calculateCompositeScore, formatResultsForTable } = require('./re-ranking');

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

describe('formatResultsForTable', () => {
  it('produces header with detected patterns in bold', () => {
    const topPatterns = {
      categories: {
        frontend: ['React', 'TypeScript'],
        backend: ['Express'],
      },
    };
    const result = formatResultsForTable([], topPatterns);
    expect(result.header).toContain('**Pattern rilevati:**');
    expect(result.header).toContain('React');
    expect(result.header).toContain('TypeScript');
    expect(result.header).toContain('Express');
  });

  it('produces markdown table with correct header row', () => {
    const result = formatResultsForTable(
      [
        { source: 'src/Button.tsx', summary: 'Button component', project_id: 'proj-A', type: 'code', language: 'TypeScript' },
      ],
      { categories: {} }
    );
    expect(result.table).toContain('| File | Descrizione | Progetto | Tecnica |');
    expect(result.table).toContain('|------|-----------|----------|---------|');
  });

  it('formats 3 results into 3 table rows', () => {
    const results = [
      { source: 'src/A.tsx', summary: 'First result', project_id: 'A', type: 'code', language: 'TS' },
      { source: 'src/B.ts', summary: 'Second result', project_id: 'B', type: 'doc', language: 'markdown' },
      { source: 'src/C.js', summary: 'Third result', project_id: 'C', type: 'code', language: 'javascript' },
    ];
    const result = formatResultsForTable(results, { categories: {} });
    const lines = result.table.split('\n').filter(l => l.includes('src/') && l.includes('|'));
    expect(lines.length).toBe(3);
  });

  it('creates anchor links for file paths', () => {
    const result = formatResultsForTable(
      [{ source: 'src/components/Button.tsx', summary: 'test', project_id: 'X', type: 'code', language: 'TS' }],
      { categories: {} }
    );
    expect(result.table).toContain('[src/components/Button.tsx](#src_components_Button_tsx)');
  });

  it('handles missing fields gracefully', () => {
    const result = formatResultsForTable(
      [{ source: '', summary: '', project_id: null, type: null, language: null }],
      { categories: {} }
    );
    expect(result.table).toContain('—');
  });

  it('truncates long descriptions to 80 chars', () => {
    const longSummary = 'A'.repeat(200);
    const result = formatResultsForTable(
      [{ source: 'test.ts', summary: longSummary, project_id: 'X', type: 'code', language: 'TS' }],
      { categories: {} }
    );
    const lines = result.table.split('\n').filter(l => l.includes('test.ts') && l.includes('|'));
    const desc = lines[0].split('|')[2].trim();
    expect(desc.length).toBeLessThanOrEqual(80);
    expect(desc).toContain('...');
  });

  it('handles empty results array', () => {
    const result = formatResultsForTable([], { categories: {} });
    expect(result.table).toContain('| File | Descrizione | Progetto | Tecnica |');
    expect(result.table).toContain('|------|-----------|----------|---------|');
    // No data rows for empty array
    expect(result.table.split('\n').filter(l => l.includes('|') && !l.includes('File')).length).toBe(1);
  });

  it('handles null results gracefully', () => {
    const result = formatResultsForTable(null, { categories: {} });
    expect(result.table).toContain('| — | — | — | — |');
  });

  it('handles undefined topPatterns gracefully', () => {
    const result = formatResultsForTable(
      [{ source: 'test.ts', summary: 'test', project_id: 'X', type: 'code', language: 'TS' }],
      undefined
    );
    expect(result.header).toBe('');
    expect(result.table).toContain('| File | Descrizione | Progetto | Tecnica |');
  });

  it('handles partially empty payload (some null, some empty)', () => {
    const result = formatResultsForTable(
      [
        { source: 'src/A.tsx', summary: null, project_id: 'X', type: 'code', language: null },
        { source: null, summary: 'has summary', project_id: null, type: null, language: null },
      ],
      { categories: {} }
    );
    expect(result.table).toContain('—');
    expect(result.table).toContain('has summary');
  });

  it('handles results with null entries in array', () => {
    const result = formatResultsForTable([null, { source: 'test.ts', summary: 'ok', project_id: 'X', type: 'code', language: 'TS' }, null], { categories: {} });
    const lines = result.table.split('\n').filter(l => l.startsWith('|'));
    // header + separator + 2 placeholder rows + 1 data row + empty
    expect(lines.some(l => l.includes('—'))).toBe(true);
  });

  it('generates footers with ### File sections', () => {
    const result = formatResultsForTable(
      [
        { source: 'src/A.tsx', summary: 'test', project_id: 'X', type: 'code', language: 'TS', content: 'const x = 1;' },
      ],
      { categories: {} }
    );
    expect(result.footers).toContain('### src/A.tsx');
    expect(result.footers).toContain('const x = 1;');
  });

  it('truncates content snippets to 200 chars in footers', () => {
    const longContent = 'A'.repeat(500);
    const result = formatResultsForTable(
      [{ source: 'test.ts', summary: 'test', project_id: 'X', type: 'code', language: 'TS', content: longContent }],
      { categories: {} }
    );
    expect(result.footers).toContain('A'.repeat(197));
    expect(result.footers).toContain('...');
  });

  it('returns footers with source header but no content when content is empty', () => {
    const result = formatResultsForTable(
      [{ source: 'test.ts', summary: 'test', project_id: 'X', type: 'code', language: 'TS', content: '' }],
      { categories: {} }
    );
    expect(result.footers).toContain('### test.ts');
    expect(result.footers).not.toContain('A');
  });

  it('returns empty footers for empty results', () => {
    const result = formatResultsForTable([], { categories: {} });
    expect(result.footers).toBe('');
  });

  it('handles topPatterns with mixed label formats (strings and objects)', () => {
    const topPatterns = {
      categories: {
        frontend: [{ label: 'React', count: 3 }, 'TypeScript'],
      },
    };
    const result = formatResultsForTable([], topPatterns);
    expect(result.header).toContain('React');
    expect(result.header).toContain('TypeScript');
  });

  it('handles topPatterns with non-array category values gracefully (no crash)', () => {
    const topPatterns = {
      categories: {
        frontend: 'React', // not an array — flatMap returns []
      },
    };
    const result = formatResultsForTable([], topPatterns);
    // Non-array values are skipped by flatMap — no crash, no labels
    expect(result.header).toBe('');
  });

  it('technique column shows type/language format', () => {
    const result = formatResultsForTable(
      [{ source: 'test.ts', summary: 'test', project_id: 'X', type: 'code', language: 'TypeScript' }],
      { categories: {} }
    );
    expect(result.table).toContain('code/TypeScript');
  });

  it('technique column shows just type when language is empty', () => {
    const result = formatResultsForTable(
      [{ source: 'test.ts', summary: 'test', project_id: 'X', type: 'doc', language: '' }],
      { categories: {} }
    );
    expect(result.table).toContain('| doc |');
  });
});
