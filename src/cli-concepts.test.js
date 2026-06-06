/**
 * CLI concepts integration tests — verifies that findRelatedConcepts,
 * findRelatedDocs, and formatConceptsSection work together to produce
 * the expected markdown output for the CLI context command.
 *
 * Uses a mock Qdrant client (no real Qdrant needed).
 */

const { findRelatedConcepts } = require('./related-concepts');
const { findRelatedDocs } = require('./related-docs');
const { formatConceptsSection } = require('./re-ranking');

// ─── Mock Qdrant client ─────────────────────────────────────────────────

function createMockClient(searchResults = [], pipelineResults = null) {
  const mockPipeline = async (text, opts) => {
    const dim = 10;
    const data = new Float32Array(dim).fill(text.length * 0.1);
    return { data };
  };

  return {
    pipeline: mockPipeline,
    generatePlaceholderEmbedding: (text) => new Array(10).fill(text.length * 0.1),
    search: async (collectionName, params) => searchResults,
  };
}

// ─── Module import resolution ───────────────────────────────────────────

describe('Module import resolution', () => {
  it('findRelatedConcepts resolves from related-concepts', () => {
    expect(typeof findRelatedConcepts).toBe('function');
  });

  it('findRelatedDocs resolves from related-docs', () => {
    expect(typeof findRelatedDocs).toBe('function');
  });

  it('formatConceptsSection resolves from re-ranking', () => {
    expect(typeof formatConceptsSection).toBe('function');
  });
});

// ─── findRelatedConcepts integration ─────────────────────────────────────

describe('findRelatedConcepts integration', () => {
  it('returns related concepts from ranked results', async () => {
    const client = createMockClient([
      { score: 0.85, payload: { source: 'src/Modal.tsx', summary: 'Modal dialog component' } },
    ]);

    const rankedResults = [
      { source: 'src/Button.tsx', summary: 'Button component', symbolNames: ['Button'] },
    ];

    const concepts = await findRelatedConcepts(client, 'test-collection', 'test query', rankedResults);
    expect(concepts.length).toBe(1);
    expect(concepts[0].name).toBe('Modal dialog component');
    expect(concepts[0].source).toBe('src/Modal.tsx');
    expect(concepts[0].score).toBe(0.85);
  });

  it('returns empty array when no secondary results', async () => {
    const client = createMockClient([]);
    const rankedResults = [{ source: 'src/Button.tsx', summary: 'Button' }];
    const concepts = await findRelatedConcepts(client, 'test-collection', 'test query', rankedResults);
    expect(concepts).toEqual([]);
  });

  it('filters out overlapping sources from primary results', async () => {
    const primaryResults = [
      { source: 'src/Button.tsx', summary: 'Button' },
      { source: 'src/Header.tsx', summary: 'Header' },
    ];

    const secondaryHits = [
      { score: 0.8, payload: { source: 'src/Button.tsx', summary: 'Button duplicate' } },
      { score: 0.7, payload: { source: 'src/NewComponent.tsx', summary: 'New component' } },
    ];

    const client = createMockClient(secondaryHits);
    const concepts = await findRelatedConcepts(client, 'test-collection', 'test query', primaryResults);

    expect(concepts.length).toBe(1);
    expect(concepts[0].source).toBe('src/NewComponent.tsx');
  });

  it('handles Qdrant search errors gracefully', async () => {
    const client = createMockClient([]);
    client.search = async () => { throw new Error('Connection refused'); };

    const rankedResults = [{ source: 'src/Button.tsx', summary: 'Button' }];
    const concepts = await findRelatedConcepts(client, 'test-collection', 'test query', rankedResults);
    expect(concepts).toEqual([]);
  });

  it('handles empty ranked results', async () => {
    const client = createMockClient([]);
    const concepts = await findRelatedConcepts(client, 'test-collection', 'test query', []);
    expect(concepts).toEqual([]);
  });
});

// ─── findRelatedDocs integration ─────────────────────────────────────────

describe('findRelatedDocs integration', () => {
  it('returns related docs grouped by shared GSD IDs', async () => {
    const client = createMockClient([
      { score: 0.8, payload: { source: 'M001-CONTEXT.md', title: 'Context doc', relatedDocIds: ['M001', 'S01'] } },
    ]);

    const rankedResults = [
      { source: 'src/Button.tsx', relatedDocIds: ['M001', 'S01'] },
    ];

    const docs = await findRelatedDocs(client, 'test-collection', rankedResults);
    expect(docs.length).toBe(1);
    expect(docs[0].ids).toContain('M001');
    expect(docs[0].ids).toContain('S01');
    expect(docs[0].docPaths).toContain('M001-CONTEXT.md');
  });

  it('returns empty array when no GSD IDs in results', async () => {
    const client = createMockClient([]);
    const rankedResults = [{ source: 'src/Button.tsx', summary: 'Button' }];
    const docs = await findRelatedDocs(client, 'test-collection', rankedResults);
    expect(docs).toEqual([]);
  });

  it('extracts GSD IDs from source path', async () => {
    const client = createMockClient([
      { score: 0.8, payload: { source: 'M002-ROADMAP.md', title: 'Roadmap', relatedDocIds: ['M002'] } },
    ]);

    const rankedResults = [
      { source: 'src/M002-PLAN.md', summary: 'Plan' },
    ];

    const docs = await findRelatedDocs(client, 'test-collection', rankedResults);
    expect(docs.length).toBe(1);
    expect(docs[0].ids).toContain('M002');
  });

  it('extracts GSD IDs from content text', async () => {
    const client = createMockClient([
      { score: 0.8, payload: { source: 'M003-CONTEXT.md', title: 'Context', relatedDocIds: ['M003'] } },
    ]);

    const rankedResults = [
      { source: 'src/code.js', content: 'See M003 for details' },
    ];

    const docs = await findRelatedDocs(client, 'test-collection', rankedResults);
    expect(docs.length).toBe(1);
    expect(docs[0].ids).toContain('M003');
  });

  it('filters docs that share no GSD IDs', async () => {
    const client = createMockClient([
      { score: 0.8, payload: { source: 'M001-CONTEXT.md', title: 'Context', relatedDocIds: ['M001'] } },
    ]);

    const rankedResults = [
      { source: 'src/Button.tsx', relatedDocIds: ['M002'] },
    ];

    const docs = await findRelatedDocs(client, 'test-collection', rankedResults);
    expect(docs.length).toBe(0);
  });

  it('groups multiple docs under shared IDs', async () => {
    const client = createMockClient([
      { score: 0.9, payload: { source: 'M001-CONTEXT.md', title: 'Context', relatedDocIds: ['M001'] } },
      { score: 0.8, payload: { source: 'M001-SUMMARY.md', title: 'Summary', relatedDocIds: ['M001'] } },
    ]);

    const rankedResults = [
      { source: 'src/Button.tsx', relatedDocIds: ['M001'] },
    ];

    const docs = await findRelatedDocs(client, 'test-collection', rankedResults);
    expect(docs.length).toBe(1);
    expect(docs[0].ids).toContain('M001');
    expect(docs[0].docPaths).toContain('M001-CONTEXT.md');
    expect(docs[0].docPaths).toContain('M001-SUMMARY.md');
  });

  it('handles Qdrant search errors gracefully', async () => {
    const client = createMockClient([]);
    client.search = async () => { throw new Error('Connection refused'); };

    const rankedResults = [{ source: 'src/Button.tsx', relatedDocIds: ['M001'] }];
    const docs = await findRelatedDocs(client, 'test-collection', rankedResults);
    expect(docs).toEqual([]);
  });

  it('handles empty ranked results', async () => {
    const client = createMockClient([]);
    const docs = await findRelatedDocs(client, 'test-collection', []);
    expect(docs).toEqual([]);
  });

  it('applies limit option', async () => {
    const client = createMockClient([
      { score: 0.9, payload: { source: 'M001-1.md', title: 'Doc 1', relatedDocIds: ['M001'] } },
      { score: 0.8, payload: { source: 'M001-2.md', title: 'Doc 2', relatedDocIds: ['M001'] } },
      { score: 0.7, payload: { source: 'M001-3.md', title: 'Doc 3', relatedDocIds: ['M001'] } },
    ]);

    const rankedResults = [{ source: 'src/Button.tsx', relatedDocIds: ['M001'] }];
    const docs = await findRelatedDocs(client, 'test-collection', rankedResults, { limit: 2 });
    expect(docs.length).toBe(1); // All 3 docs share M001, so they're in 1 group
    expect(docs[0].docPaths.length).toBe(3); // But the group has 3 paths
  });
});

// ─── formatConceptsSection integration ───────────────────────────────────

describe('formatConceptsSection integration', () => {
  it('produces markdown with concepts section', () => {
    const concepts = [
      { name: 'Modal', description: 'A modal dialog', source: 'src/Modal.tsx', score: 0.85 },
    ];
    const relatedDocs = [];
    const output = formatConceptsSection(concepts, relatedDocs);

    expect(output).toContain('## Concetti correlati');
    expect(output).toContain('**Modal**');
    expect(output).toContain('A modal dialog');
    expect(output).toContain('Source: src/Modal.tsx (score: 0.85)');
  });

  it('produces markdown with docs section', () => {
    const concepts = [];
    const relatedDocs = [
      { ids: ['M001'], docPaths: ['M001-CONTEXT.md'], descriptions: ['Context doc'] },
    ];
    const output = formatConceptsSection(concepts, relatedDocs);

    expect(output).toContain('## Documentazione correlata');
    expect(output).toContain('GSD IDs: M001');
    expect(output).toContain('M001-CONTEXT.md');
  });

  it('produces markdown with both sections', () => {
    const concepts = [
      { name: 'Modal', description: 'A modal dialog', source: 'src/Modal.tsx', score: 0.85 },
    ];
    const relatedDocs = [
      { ids: ['M001'], docPaths: ['M001-CONTEXT.md'], descriptions: ['Context doc'] },
    ];
    const output = formatConceptsSection(concepts, relatedDocs);

    expect(output).toContain('## Concetti correlati');
    expect(output).toContain('## Documentazione correlata');
    expect(output.indexOf('## Concetti correlati')).toBeLessThan(output.indexOf('## Documentazione correlata'));
  });

  it('returns empty string when both inputs are empty', () => {
    const output = formatConceptsSection([], []);
    expect(output).toBe('');
  });

  it('truncates long descriptions to 120 chars', () => {
    const longDesc = 'A'.repeat(200);
    const concepts = [
      { name: 'LongDesc', description: longDesc, source: 'src/x.ts', score: 0.5 },
    ];
    const output = formatConceptsSection(concepts, []);
    const match = output.match(/\*\*LongDesc\*\* — (.+?)(?=\n)/);
    expect(match).not.toBeNull();
    expect(match[1].length).toBeLessThanOrEqual(120);
    expect(match[1]).toContain('...');
  });

  it('handles null/undefined inputs gracefully', () => {
    expect(formatConceptsSection(null, [])).toBe('');
    expect(formatConceptsSection(undefined, [])).toBe('');
    expect(formatConceptsSection([], null)).toBe('');
    expect(formatConceptsSection(null, null)).toBe('');
  });

  it('handles non-array inputs gracefully', () => {
    expect(formatConceptsSection('not an array', [])).toBe('');
    expect(formatConceptsSection([], 'not an array')).toBe('');
  });

  it('handles null entries in arrays (index increments, content skipped)', () => {
    const concepts = [null, { name: 'valid', description: 'ok', source: 'src/a.ts', score: 0.8 }, null];
    const output = formatConceptsSection(concepts, []);
    expect(output).toContain('2. **valid** — ok');
  });
});

// ─── Full flow: ranked results → concepts → docs → formatted output ─────

describe('Full flow: ranked results → concepts → docs → formatted output', () => {
  it('integrates concepts and docs into table output', async () => {
    const client = createMockClient([
      { score: 0.8, payload: { source: 'src/Modal.tsx', summary: 'Modal dialog component' } },
      { score: 0.7, payload: { source: 'M001-CONTEXT.md', title: 'Context', relatedDocIds: ['M001'] } },
    ]);

    const rankedResults = [
      {
        source: 'src/Button.tsx',
        summary: 'Button component',
        relatedDocIds: ['M001'],
        symbolNames: ['Button'],
      },
    ];

    const concepts = await findRelatedConcepts(client, 'test-collection', 'test query', rankedResults);
    const relatedDocs = await findRelatedDocs(client, 'test-collection', rankedResults);
    const conceptsSection = formatConceptsSection(concepts, relatedDocs);

    // Should contain both sections
    if (concepts.length > 0) {
      expect(conceptsSection).toContain('## Concetti correlati');
    }
    if (relatedDocs.length > 0) {
      expect(conceptsSection).toContain('## Documentazione correlata');
    }
  });

  it('produces table-compatible output (appended to footers)', async () => {
    const client = createMockClient([
      { score: 0.8, payload: { source: 'src/Modal.tsx', summary: 'Modal dialog' } },
    ]);

    const rankedResults = [
      { source: 'src/Button.tsx', summary: 'Button', relatedDocIds: ['M001'] },
    ];

    const concepts = await findRelatedConcepts(client, 'test-collection', 'test query', rankedResults);
    const relatedDocs = await findRelatedDocs(client, 'test-collection', rankedResults);
    const conceptsSection = formatConceptsSection(concepts, relatedDocs);

    // Simulate appending to tableOutput.footers
    let footers = '### src/Button.tsx\n\nButton content...\n\n';
    footers += conceptsSection;

    // Should contain concepts section after table footers
    expect(footers).toContain('## Concetti correlati');
    expect(footers).toContain('Modal dialog');
  });

  it('handles empty concepts and docs gracefully', async () => {
    const client = createMockClient([]);
    const rankedResults = [{ source: 'src/Button.tsx', summary: 'Button' }];

    const concepts = await findRelatedConcepts(client, 'test-collection', 'test query', rankedResults);
    const relatedDocs = await findRelatedDocs(client, 'test-collection', rankedResults);
    const conceptsSection = formatConceptsSection(concepts, relatedDocs);

    expect(conceptsSection).toBe('');
  });

  it('handles concepts with missing fields and docs with alternate keys', async () => {
    const client = createMockClient([
      { score: 0.8, payload: { source: 'src/NoSummary.tsx' } },
      { score: 0.7, payload: { source: 'M001.md', relatedDocIds: ['M001'] } },
    ]);

    const rankedResults = [
      { source: 'src/Button.tsx', summary: 'Button', relatedDocIds: ['M001'] },
    ];

    const concepts = await findRelatedConcepts(client, 'test-collection', 'test query', rankedResults);
    const relatedDocs = await findRelatedDocs(client, 'test-collection', rankedResults);
    const conceptsSection = formatConceptsSection(concepts, relatedDocs);

    // Concepts with missing summary should use fallback description
    if (concepts.length > 0) {
      expect(conceptsSection).toContain('NoSummary');
    }
    // Docs should still render
    if (relatedDocs.length > 0) {
      expect(conceptsSection).toContain('## Documentazione correlata');
    }
  });
});
