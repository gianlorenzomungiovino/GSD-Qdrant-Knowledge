/**
 * Tests for formatConceptsSection — markdown formatting of related concepts
 * and documentation correlation for CLI output.
 */

const { formatConceptsSection } = require('./re-ranking');

describe('formatConceptsSection', () => {
  // ── Empty inputs ──────────────────────────────────────────────────────

  it('returns empty string when both arrays are empty', () => {
    expect(formatConceptsSection([], [])).toBe('');
  });

  it('returns empty string when both inputs are null', () => {
    expect(formatConceptsSection(null, null)).toBe('');
  });

  it('returns empty string when both inputs are undefined', () => {
    expect(formatConceptsSection(undefined, undefined)).toBe('');
  });

  it('returns empty string when concepts is null and relatedDocs is empty', () => {
    expect(formatConceptsSection(null, [])).toBe('');
  });

  it('returns empty string when concepts is empty and relatedDocs is null', () => {
    expect(formatConceptsSection([], null)).toBe('');
  });

  // ── Concepts section ──────────────────────────────────────────────────

  it('produces numbered list with correct format for concepts', () => {
    const concepts = [
      { name: 'AuthModule', description: 'Handles authentication flow', source: 'src/auth.ts', score: 0.85 },
      { name: 'TokenManager', description: 'Manages JWT tokens', source: 'src/token.ts', score: 0.72 },
    ];
    const result = formatConceptsSection(concepts, []);
    expect(result).toContain('\n## Concetti correlati\n\n');
    expect(result).toContain('1. **AuthModule** — Handles authentication flow');
    expect(result).toContain('2. **TokenManager** — Manages JWT tokens');
    expect(result).toContain('   - Source: src/auth.ts (score: 0.85)');
    expect(result).toContain('   - Source: src/token.ts (score: 0.72)');
  });

  it('formats single concept correctly', () => {
    const concepts = [{ name: 'SingleConcept', description: 'One concept', source: 'src/x.ts', score: 0.9 }];
    const result = formatConceptsSection(concepts, []);
    expect(result).toContain('1. **SingleConcept** — One concept');
    expect(result).toContain('   - Source: src/x.ts (score: 0.90)');
  });

  it('handles concepts with missing fields gracefully', () => {
    const concepts = [
      { description: 'no name or source', score: 0.5 },
      { name: 'no description', source: 'src/y.ts', score: 0.3 },
      { name: 'no score', description: 'test', source: 'src/z.ts' },
    ];
    const result = formatConceptsSection(concepts, []);
    expect(result).toContain('Concetto sconosciuto');
    expect(result).toContain('no description');
    // score 0.3 is numeric → formats as 0.30
    expect(result).toContain('   - Source: src/y.ts (score: 0.30)');
    // missing score → formats as N/A
    expect(result).toContain('   - Source: src/z.ts (score: N/A)');
  });

  it('handles concepts with null entries in array', () => {
    const concepts = [null, { name: 'valid', description: 'ok', source: 'src/a.ts', score: 0.8 }, null];
    const result = formatConceptsSection(concepts, []);
    // null entries skip content but index still increments, so valid is #2
    expect(result).toContain('2. **valid** — ok');
  });

  it('truncates long descriptions to 120 chars', () => {
    const longDesc = 'A'.repeat(200);
    const concepts = [{ name: 'LongDesc', description: longDesc, source: 'src/x.ts', score: 0.5 }];
    const result = formatConceptsSection(concepts, []);
    // Extract the description part after "**LongDesc** — "
    const match = result.match(/\*\*LongDesc\*\* — (.+?)(?=\n)/);
    expect(match).not.toBeNull();
    const desc = match[1];
    expect(desc.length).toBeLessThanOrEqual(120);
    expect(desc).toContain('...');
  });

  it('does not truncate descriptions under 120 chars', () => {
    const shortDesc = 'A'.repeat(50);
    const concepts = [{ name: 'ShortDesc', description: shortDesc, source: 'src/x.ts', score: 0.5 }];
    const result = formatConceptsSection(concepts, []);
    expect(result).toContain(shortDesc);
    expect(result).not.toContain('...');
  });

  // ── Documentation section ─────────────────────────────────────────────

  it('produces documentation section with GSD IDs and doc paths', () => {
    const relatedDocs = [
      {
        ids: ['M001', 'S01'],
        docPaths: ['M001-CONTEXT.md', 'S01-SUMMARY.md'],
        descriptions: ['Milestone brief', 'Slice summary'],
      },
    ];
    const result = formatConceptsSection([], relatedDocs);
    expect(result).toContain('\n## Documentazione correlata\n\n');
    expect(result).toContain('### GSD IDs: M001, S01');
    expect(result).toContain('- M001-CONTEXT.md — Milestone brief');
    expect(result).toContain('- S01-SUMMARY.md — Slice summary');
  });

  it('produces multiple doc groups', () => {
    const relatedDocs = [
      { ids: ['M001'], docPaths: ['M001.md'], descriptions: ['Brief'] },
      { ids: ['M002', 'S02'], docPaths: ['M002.md'], descriptions: ['Another'] },
    ];
    const result = formatConceptsSection([], relatedDocs);
    expect(result).toContain('### GSD IDs: M001');
    expect(result).toContain('### GSD IDs: M002, S02');
  });

  it('handles relatedDocs with sharedIds key (from findRelatedDocs output)', () => {
    const relatedDocs = [
      { sharedIds: ['R001', 'R002'], sources: ['src/api.ts'], titles: ['API docs'] },
    ];
    const result = formatConceptsSection([], relatedDocs);
    expect(result).toContain('### GSD IDs: R001, R002');
    expect(result).toContain('- src/api.ts — API docs');
  });

  it('handles relatedDocs with missing fields gracefully', () => {
    const relatedDocs = [
      { ids: ['M001'] }, // no docPaths
      { docPaths: ['orphan.md'] }, // no ids
    ];
    const result = formatConceptsSection([], relatedDocs);
    expect(result).toContain('### GSD IDs: M001');
    expect(result).toContain('- orphan.md');
  });

  it('handles null entries in relatedDocs array', () => {
    const relatedDocs = [null, { ids: ['M001'], docPaths: ['M001.md'], descriptions: ['ok'] }, null];
    const result = formatConceptsSection([], relatedDocs);
    expect(result).toContain('### GSD IDs: M001');
  });

  // ── Both sections ─────────────────────────────────────────────────────

  it('produces both sections when both arrays are non-empty', () => {
    const concepts = [{ name: 'AuthModule', description: 'Auth', source: 'src/auth.ts', score: 0.8 }];
    const relatedDocs = [{ ids: ['M001'], docPaths: ['M001.md'], descriptions: ['Brief'] }];
    const result = formatConceptsSection(concepts, relatedDocs);
    expect(result).toContain('## Concetti correlati');
    expect(result).toContain('## Documentazione correlata');
    expect(result).toContain('AuthModule');
    expect(result).toContain('M001');
  });

  it('maintains correct section order: concepts first, then docs', () => {
    const concepts = [{ name: 'First', description: 'C', source: 's.ts', score: 0.5 }];
    const relatedDocs = [{ ids: ['M001'], docPaths: ['d.md'], descriptions: ['D'] }];
    const result = formatConceptsSection(concepts, relatedDocs);
    const conceptsIdx = result.indexOf('## Concetti correlati');
    const docsIdx = result.indexOf('## Documentazione correlata');
    expect(conceptsIdx).toBeGreaterThan(-1);
    expect(docsIdx).toBeGreaterThan(conceptsIdx);
  });

  // ── Error handling ────────────────────────────────────────────────────

  it('handles null concepts gracefully (treats as empty)', () => {
    const relatedDocs = [{ ids: ['M001'], docPaths: ['d.md'] }];
    const result = formatConceptsSection(null, relatedDocs);
    expect(result).toContain('## Documentazione correlata');
    expect(result).not.toContain('## Concetti correlati');
  });

  it('handles undefined concepts gracefully (treats as empty)', () => {
    const relatedDocs = [{ ids: ['M001'], docPaths: ['d.md'] }];
    const result = formatConceptsSection(undefined, relatedDocs);
    expect(result).toContain('## Documentazione correlata');
  });

  it('handles null relatedDocs gracefully (treats as empty)', () => {
    const concepts = [{ name: 'Test', description: 'D', source: 's.ts', score: 0.5 }];
    const result = formatConceptsSection(concepts, null);
    expect(result).toContain('## Concetti correlati');
    expect(result).not.toContain('## Documentazione correlata');
  });

  it('handles non-array concepts gracefully (treats as empty)', () => {
    const result = formatConceptsSection('not an array', []);
    expect(result).toBe('');
  });

  it('handles non-array relatedDocs gracefully (treats as empty)', () => {
    const result = formatConceptsSection([], 'not an array');
    expect(result).toBe('');
  });

  it('exports as a named function', () => {
    expect(typeof formatConceptsSection).toBe('function');
  });
});
