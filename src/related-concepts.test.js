const { extractKeywords, findRelatedConcepts, findRelatedDocs, deriveDescription } = require('./related-concepts');

// ─── extractKeywords tests ───────────────────────────────────────────────────

describe('extractKeywords', () => {
  it('returns empty array for null input', () => {
    expect(extractKeywords(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(extractKeywords(undefined)).toEqual([]);
  });

  it('returns empty array for empty array', () => {
    expect(extractKeywords([])).toEqual([]);
  });

  it('extracts keywords from source paths', () => {
    const results = [
      { source: 'src/components/Button.tsx', summary: 'A button' },
    ];
    const keywords = extractKeywords(results);
    expect(keywords).toContain('src');
    expect(keywords).toContain('components');
    expect(keywords).toContain('button');
    // 'tsx' is 3 chars — should be included
    expect(keywords).toContain('tsx');
  });

  it('extracts keywords from summary text', () => {
    const results = [
      { summary: 'This is a really long summary with many words', source: 'test.js' },
    ];
    const keywords = extractKeywords(results);
    expect(keywords).toContain('this');
    expect(keywords).toContain('really');
    expect(keywords).toContain('summary');
    expect(keywords).toContain('words');
  });

  it('extracts keywords from symbolNames', () => {
    const results = [
      { symbolNames: ['useEffect', 'MyComponent', 'helperFunc'], source: 'test.js' },
    ];
    const keywords = extractKeywords(results);
    expect(keywords).toContain('useeffect');
    expect(keywords).toContain('mycomponent');
    expect(keywords).toContain('helperfunc');
  });

  it('extracts keywords from tags', () => {
    const results = [
      { tags: ['react', 'frontend', 'ui'], source: 'test.js' },
    ];
    const keywords = extractKeywords(results);
    expect(keywords).toContain('react');
    expect(keywords).toContain('frontend');
    expect(keywords).not.toContain('ui'); // 'ui' is 2 chars — should be filtered out
  });

  it('filters short tokens (< 3 chars)', () => {
    const results = [
      { summary: 'a ab abc abcd', source: 'x.yz.abc' },
    ];
    const keywords = extractKeywords(results);
    expect(keywords).not.toContain('a');
    expect(keywords).not.toContain('ab');
    expect(keywords).not.toContain('x');
    expect(keywords).not.toContain('yz');
    expect(keywords).toContain('abc');
    expect(keywords).toContain('abcd');
  });

  it('deduplicates across fields', () => {
    const results = [
      {
        source: 'src/utils/helper.js',
        summary: 'Helper utility function',
        symbolNames: ['helperFunc'],
        tags: ['helper'],
      },
    ];
    const keywords = extractKeywords(results);
    // 'helper' appears in source, summary, symbolName, and tag — should appear only once
    expect(keywords.filter(k => k === 'helper').length).toBe(1);
  });

  it('deduplicates across multiple results', () => {
    const results = [
      { source: 'src/Button.tsx', summary: 'Button component' },
      { source: 'src/Button.css', summary: 'Button styles' },
    ];
    const keywords = extractKeywords(results);
    expect(keywords.filter(k => k === 'button').length).toBe(1);
  });

  it('limits to top 20 keywords', () => {
    const results = [];
    for (let i = 0; i < 50; i++) {
      results.push({
        source: `src/module${i.toString().padStart(3, '0')}.js`,
        summary: `Module ${i} with many keywords to exceed the limit`,
        symbolNames: [`func${i}`],
        tags: [`tag${i}`],
      });
    }
    const keywords = extractKeywords(results);
    expect(keywords.length).toBeLessThanOrEqual(20);
  });

  it('handles results with missing fields gracefully', () => {
    const results = [
      {},
      { source: null },
      { summary: undefined },
      { symbolNames: null },
      { tags: undefined },
      { source: '' },
    ];
    const keywords = extractKeywords(results);
    expect(Array.isArray(keywords)).toBe(true);
    // Should not crash — may have some keywords from empty strings
  });

  it('handles results with non-object entries', () => {
    const results = [null, 'string', 42, true];
    const keywords = extractKeywords(results);
    expect(keywords).toEqual([]);
  });

  it('lowercases all keywords', () => {
    const results = [
      { source: 'src/MyComponent.jsx', summary: 'MyComponent Description' },
    ];
    const keywords = extractKeywords(results);
    for (const kw of keywords) {
      expect(kw).toBe(kw.toLowerCase());
    }
  });

  it('splits source on backslashes (Windows paths)', () => {
    const results = [
      { source: 'src\\components\\Button.tsx', summary: 'Button' },
    ];
    const keywords = extractKeywords(results);
    expect(keywords).toContain('src');
    expect(keywords).toContain('components');
    expect(keywords).toContain('button');
  });
});

// ─── deriveDescription tests ─────────────────────────────────────────────────

describe('deriveDescription', () => {
  it('prefers summary over content', () => {
    const payload = {
      summary: 'This is the summary',
      content: 'This is the content that should not be used',
    };
    expect(deriveDescription(payload)).toBe('This is the summary');
  });

  it('uses first 100 chars of content when no summary', () => {
    const longContent = 'A'.repeat(200);
    const payload = { content: longContent };
    const desc = deriveDescription(payload);
    expect(desc).toBe('A'.repeat(100));
  });

  it('uses source basename when no summary or content', () => {
    const payload = { source: 'src/components/Button.tsx' };
    expect(deriveDescription(payload)).toBe('Button');
  });

  it('returns "—" when all fields are empty', () => {
    expect(deriveDescription({})).toBe('—');
    expect(deriveDescription(null)).toBe('—');
    expect(deriveDescription(undefined)).toBe('—');
  });

  it('handles payload with empty strings', () => {
    const payload = { summary: '', content: '', source: '' };
    expect(deriveDescription(payload)).toBe('—');
  });
});

// ─── findRelatedConcepts tests ───────────────────────────────────────────────

describe('findRelatedConcepts', () => {
  // Create a mock Qdrant client with controllable behavior
  function createMockClient(searchResults = [], embedVector = null) {
    const mockPipeline = async (text, opts) => {
      // Deterministic "embedding" — just return a vector based on text length
      const dim = 10;
      const data = new Float32Array(dim).fill(text.length * 0.1);
      return { data: data };
    };

    const mockGeneratePlaceholderEmbedding = (text) => {
      const dim = 10;
      return new Array(dim).fill(text.length * 0.1);
    };

    return {
      pipeline: mockPipeline, // callable function like the real client
      generatePlaceholderEmbedding: mockGeneratePlaceholderEmbedding,
      search: async (collectionName, params) => {
        if (embedVector) {
          // Use the provided vector for comparison
          embedVector._used = true;
        }
        return searchResults;
      },
    };
  }

  it('returns empty array for empty rankedResults', async () => {
    const client = createMockClient([]);
    const results = await findRelatedConcepts(client, 'test-collection', 'test query', []);
    expect(results).toEqual([]);
  });

  it('returns empty array for null rankedResults', async () => {
    const client = createMockClient([]);
    const results = await findRelatedConcepts(client, 'test-collection', 'test query', null);
    expect(results).toEqual([]);
  });

  it('filters out results that overlap with primary ranked results by source', async () => {
    const primaryResults = [
      { source: 'src/Button.tsx', summary: 'Button component' },
      { source: 'src/Header.tsx', summary: 'Header component' },
    ];

    const secondaryHits = [
      { score: 0.85, payload: { source: 'src/Button.tsx', summary: 'Button duplicate' } },
      { score: 0.75, payload: { source: 'src/NewComponent.tsx', summary: 'New component' } },
      { score: 0.65, payload: { source: 'src/Header.tsx', summary: 'Header duplicate' } },
      { score: 0.55, payload: { source: 'src/Footer.tsx', summary: 'Footer component' } },
    ];

    const client = createMockClient(secondaryHits);
    const results = await findRelatedConcepts(client, 'test-collection', 'test query', primaryResults);

    // Should only return NewComponent and Footer (Button and Header are filtered out)
    expect(results.length).toBe(2);
    expect(results[0].source).toBe('src/NewComponent.tsx');
    expect(results[1].source).toBe('src/Footer.tsx');
  });

  it('limits results to top 5', async () => {
    const primaryResults = [{ source: 'src/A.tsx', summary: 'A' }];

    const secondaryHits = [];
    for (let i = 0; i < 20; i++) {
      secondaryHits.push({
        score: 0.9 - i * 0.03,
        payload: { source: `src/Component${i}.tsx`, summary: `Component ${i}` },
      });
    }

    const client = createMockClient(secondaryHits);
    const results = await findRelatedConcepts(client, 'test-collection', 'test query', primaryResults);
    expect(results.length).toBe(5);
  });

  it('applies threshold filter', async () => {
    const primaryResults = [{ source: 'src/A.tsx', summary: 'A' }];

    const secondaryHits = [
      { score: 0.60, payload: { source: 'src/High.tsx', summary: 'High score' } },
      { score: 0.51, payload: { source: 'src/Mid.tsx', summary: 'Mid score' } },
      { score: 0.49, payload: { source: 'src/Low.tsx', summary: 'Low score' } },
      { score: 0.30, payload: { source: 'src/VeryLow.tsx', summary: 'Very low score' } },
    ];

    const client = createMockClient(secondaryHits);
    const results = await findRelatedConcepts(client, 'test-collection', 'test query', primaryResults, { threshold: 0.50 });

    // Only High and Mid should pass the 0.50 threshold
    expect(results.length).toBe(2);
    expect(results[0].source).toBe('src/High.tsx');
    expect(results[1].source).toBe('src/Mid.tsx');
  });

  it('handles Qdrant search errors gracefully', async () => {
    const primaryResults = [{ source: 'src/A.tsx', summary: 'A' }];

    const client = createMockClient([]);
    client.search = async () => {
      throw new Error('Connection refused');
    };

    const results = await findRelatedConcepts(client, 'test-collection', 'test query', primaryResults);
    expect(results).toEqual([]);
  });

  it('derives description from summary > content > basename', async () => {
    const primaryResults = [
      { source: 'src/WithSummary.tsx', summary: 'Has summary' },
      { source: 'src/WithContent.tsx', content: 'Content text here' },
      { source: 'src/OnlySource.tsx' },
    ];

    // Secondary hits use DIFFERENT sources (non-overlapping) to test description derivation
    const secondaryHits = [
      { score: 0.8, payload: { source: 'src/OtherWithSummary.tsx', summary: 'Other summary' } },
      { score: 0.7, payload: { source: 'src/OtherWithContent.tsx', content: 'Content text here' } },
      { score: 0.6, payload: { source: 'src/OnlyOtherSource.tsx' } },
    ];

    const client = createMockClient(secondaryHits);
    const results = await findRelatedConcepts(client, 'test-collection', 'test query', primaryResults);

    // No overlap — all 3 should pass (limited to 5)
    expect(results.length).toBe(3);
    expect(results[0].description).toBe('Other summary');
    expect(results[1].description).toBe('Content text here');
    expect(results[2].description).toBe('OnlyOtherSource');
  });

  it('includes type, language, and project_id in results', async () => {
    const primaryResults = [{ source: 'src/A.tsx', summary: 'A' }];
    const secondaryHits = [
      { score: 0.8, payload: { source: 'src/B.tsx', summary: 'B', type: 'code', language: 'TypeScript', project_id: 'proj-A' } },
    ];

    const client = createMockClient(secondaryHits);
    const results = await findRelatedConcepts(client, 'test-collection', 'test query', primaryResults);

    expect(results[0].type).toBe('code');
    expect(results[0].language).toBe('TypeScript');
    expect(results[0].project_id).toBe('proj-A');
  });

  it('uses options.vectorName when provided', async () => {
    const primaryResults = [{ source: 'src/A.tsx', summary: 'A' }];
    const secondaryHits = [{ score: 0.8, payload: { source: 'src/B.tsx', summary: 'B' } }];

    let capturedVectorName;
    const client = createMockClient(secondaryHits);
    client.search = async (collectionName, params) => {
      capturedVectorName = params.vector?.name;
      return secondaryHits;
    };

    await findRelatedConcepts(client, 'test-collection', 'test query', primaryResults, { vectorName: 'custom-vector' });
    expect(capturedVectorName).toBe('custom-vector');
  });

  it('extracts keywords from multiple results with diverse fields', async () => {
    const primaryResults = [
      { source: 'src/components/Button.tsx', summary: 'Button component for UI', symbolNames: ['Button', 'useButton'], tags: ['react', 'ui'] },
      { source: 'src/hooks/useClick.js', summary: 'Click handler hook', symbolNames: ['useClick'], tags: ['hook'] },
    ];

    const secondaryHits = [
      { score: 0.8, payload: { source: 'src/components/Modal.tsx', summary: 'Modal dialog' } },
      { score: 0.7, payload: { source: 'src/utils/event.js', summary: 'Event utilities' } },
    ];

    const client = createMockClient(secondaryHits);
    const results = await findRelatedConcepts(client, 'test-collection', 'test query', primaryResults);

    // Both results should pass (no source overlap)
    expect(results.length).toBe(2);
  });

  it('handles path field as fallback for source', async () => {
    const primaryResults = [{ path: 'src/A.tsx', summary: 'A' }];
    const secondaryHits = [
      { score: 0.8, payload: { path: 'src/A.tsx', summary: 'Duplicate' } },
      { score: 0.7, payload: { path: 'src/B.tsx', summary: 'B' } },
    ];

    const client = createMockClient(secondaryHits);
    const results = await findRelatedConcepts(client, 'test-collection', 'test query', primaryResults);

    // A.tsx filtered by path overlap, B.tsx remains
    expect(results.length).toBe(1);
    expect(results[0].source).toBe('src/B.tsx');
  });
});

// ─── findRelatedDocs tests ───────────────────────────────────────────────────

describe('findRelatedDocs', () => {
  function createMockClient(searchResults = []) {
    const mockPipeline = async (text, opts) => {
      const dim = 10;
      const data = new Float32Array(dim).fill(text.length * 0.1);
      return { data: data };
    };

    return {
      pipeline: mockPipeline, // callable function like the real client
      generatePlaceholderEmbedding: (text) => new Array(10).fill(text.length * 0.1),
      search: async (collectionName, params) => searchResults,
    };
  }

  it('returns empty array when no GSD IDs found', async () => {
    const client = createMockClient([]);
    const results = await findRelatedDocs(client, 'test-collection', 'src/Button.tsx', {});
    expect(results).toEqual([]);
  });

  it('extracts GSD IDs from payload.relatedDocIds', async () => {
    const client = createMockClient([
      { score: 0.8, payload: { source: 'M001-CONTEXT.md', title: 'Context', relatedDocIds: ['M001'] } },
    ]);

    const results = await findRelatedDocs(client, 'test-collection', 'src/Button.tsx', {
      relatedDocIds: ['M001', 'S01'],
    });

    expect(results.length).toBe(1);
    expect(results[0].sharedIds).toContain('M001');
  });

  it('extracts GSD IDs from source path', async () => {
    const client = createMockClient([
      { score: 0.8, payload: { source: 'M002-ROADMAP.md', title: 'Roadmap', relatedDocIds: ['M002'] } },
    ]);

    const results = await findRelatedDocs(client, 'test-collection', 'src/M002-PLAN.md', {});

    expect(results.length).toBe(1);
    expect(results[0].sharedIds).toContain('M002');
  });

  it('extracts GSD IDs from content', async () => {
    const client = createMockClient([
      { score: 0.8, payload: { source: 'M003-CONTEXT.md', title: 'Context', relatedDocIds: ['M003'] } },
    ]);

    const results = await findRelatedDocs(client, 'test-collection', 'src/code.js', {
      content: 'See M003 for details',
    });

    expect(results.length).toBe(1);
    expect(results[0].sharedIds).toContain('M003');
  });

  it('filters docs that share no GSD IDs', async () => {
    const client = createMockClient([
      { score: 0.8, payload: { source: 'M001-CONTEXT.md', title: 'Context', relatedDocIds: ['M001'] } },
      { score: 0.7, payload: { source: 'M002-ROADMAP.md', title: 'Roadmap', relatedDocIds: ['M002'] } },
    ]);

    const results = await findRelatedDocs(client, 'test-collection', 'src/Button.tsx', {
      relatedDocIds: ['M003'],
    });

    expect(results.length).toBe(0);
  });

  it('limits results to top N', async () => {
    const client = createMockClient([
      { score: 0.9, payload: { source: 'M001-CONTEXT.md', title: 'Doc 1', relatedDocIds: ['M001'] } },
      { score: 0.8, payload: { source: 'M002-ROADMAP.md', title: 'Doc 2', relatedDocIds: ['M001'] } },
      { score: 0.7, payload: { source: 'M003-UAT.md', title: 'Doc 3', relatedDocIds: ['M001'] } },
    ]);

    const results = await findRelatedDocs(client, 'test-collection', 'src/Button.tsx', {
      relatedDocIds: ['M001'],
    }, { limit: 2 });

    expect(results.length).toBe(2);
  });

  it('handles Qdrant search errors gracefully', async () => {
    const client = createMockClient([]);
    client.search = async () => { throw new Error('Connection refused'); };

    const results = await findRelatedDocs(client, 'test-collection', 'src/Button.tsx', {
      relatedDocIds: ['M001'],
    });

    expect(results).toEqual([]);
  });

  it('includes source, title, sharedIds, and score in results', async () => {
    const client = createMockClient([
      { score: 0.85, payload: { source: 'M001-CONTEXT.md', title: 'Context Doc', relatedDocIds: ['M001', 'S01'] } },
    ]);

    const results = await findRelatedDocs(client, 'test-collection', 'src/Button.tsx', {
      relatedDocIds: ['M001', 'S01'], // include both so intersection matches
    });

    expect(results[0].source).toBe('M001-CONTEXT.md');
    expect(results[0].title).toBe('Context Doc');
    expect(results[0].sharedIds).toContain('M001');
    expect(results[0].sharedIds).toContain('S01');
    expect(results[0].score).toBe(0.85);
  });

  it('handles payload with no relatedDocIds but GSD IDs in path', async () => {
    const client = createMockClient([
      { score: 0.8, payload: { source: 'S01-PLAN.md', title: 'Slice Plan', relatedDocIds: ['S01'] } },
    ]);

    const results = await findRelatedDocs(client, 'test-collection', 'src/S01-PLAN.md', {});

    expect(results.length).toBe(1);
    expect(results[0].sharedIds).toContain('S01');
  });
});
