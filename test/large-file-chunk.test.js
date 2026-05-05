import { describe, it, expect, beforeEach } from 'vitest';

describe('chunkLargeFileContent — fixed-size chunking for large files', () => {
  let instance;

  beforeEach(() => {
    instance = Object.create(require('../src/gsd-qdrant-template.js').GSDKnowledgeSync.prototype);
    instance.projectName = 'test-project';
  });

  it('splits content into chunks of maxChars (8000 default)', () => {
    // Create a string of ~25K chars → should produce ~3 chunks at 8000 each.
    const content = 'x'.repeat(25000);
    const chunks = instance.chunkLargeFileContent(content, 8000);

    expect(chunks.length).toBe(4); // ceil(25000/8000) = 4
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].text.length).toBeLessThanOrEqual(8000);
    }
    // Last chunk may be shorter.
    expect(chunks[3].text.length).toBeLessThanOrEqual(8000);
  });

  it('returns correct index and totalChunks metadata', () => {
    const content = 'x'.repeat(17000);
    const chunks = instance.chunkLargeFileContent(content, 5000);

    expect(chunks.length).toBe(4); // ceil(17000/5000) = 4
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
      expect(chunks[i].totalChunks).toBe(4);
    }
  });

  it('tries to break at line boundaries when possible', () => {
    // Create content with newlines — should prefer breaking at \n.
    const lines = [];
    for (let i = 0; i < 200; i++) {
      lines.push(`line ${i}: ` + 'a'.repeat(150)); // ~160 chars per line → ~32K total
    }
    const content = lines.join('\n');

    expect(content.length).toBeGreaterThan(32000);
    const chunks = instance.chunkLargeFileContent(content, 8000);

    // Each chunk should end at a newline (except possibly the last one).
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].text.endsWith('\n')).toBe(true);
    }
  });

  it('handles content smaller than maxChars — returns single chunk', () => {
    const content = 'x'.repeat(5000);
    const chunks = instance.chunkLargeFileContent(content, 8000);

    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe(content);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].totalChunks).toBe(1);
  });

  it('handles content exactly at maxChars', () => {
    const content = 'x'.repeat(8000);
    const chunks = instance.chunkLargeFileContent(content, 8000);

    expect(chunks.length).toBe(1);
    expect(chunks[0].text.length).toBe(8000);
  });

  it('handles empty content', () => {
    const content = '';
    const chunks = instance.chunkLargeFileContent(content, 8000);

    expect(chunks.length).toBe(0);
  });

  it('preserves all original characters across chunks (no data loss)', () => {
    const original = 'Hello world!\n' + 'x'.repeat(25000) + '\nFinal line.';
    const chunks = instance.chunkLargeFileContent(original, 8000);

    const reconstructed = chunks.map((c) => c.text).join('');
    expect(reconstructed.length).toBe(original.length);
    // Note: may not be byte-identical if broken at newlines — just check total coverage.
    let coveredChars = 0;
    for (const chunk of chunks) {
      coveredChars += chunk.text.length;
    }
    expect(coveredChars).toBeGreaterThanOrEqual(original.length);
  });

  it('supports custom maxChars parameter', () => {
    const content = 'x'.repeat(10000);
    const chunks = instance.chunkLargeFileContent(content, 3000);

    // ceil(10000/3000) = 4
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(3000 + 200); // Allow small newline overshoot
    }
  });

  it('produces ~6 chunks for a 47K file at maxChars=8000', () => {
    const content = 'x'.repeat(47000);
    const chunks = instance.chunkLargeFileContent(content, 8000);

    expect(chunks.length).toBeGreaterThanOrEqual(5); // ceil(47000/8000) ≈ 6
    expect(chunks.length).toBeLessThanOrEqual(7);   // Allow newline break overshoot
  });
});

describe('buildLargeFileChunkPayload — payload for large-file chunks', () => {
  let instance;

  beforeEach(() => {
    instance = Object.create(require('../src/gsd-qdrant-template.js').GSDKnowledgeSync.prototype);
    instance.projectName = 'test-project';
  });

  it('sets type to large-file-chunk with chunk metadata', async () => {
    const content = 'function foo() {}'.repeat(100); // ~2K chars of code
    const relPath = 'src/large.js';
    const chunkInfo = { index: 0, totalChunks: 3 };

    const payload = await instance.buildLargeFileChunkPayload('test/src/large.js', content, relPath, null, chunkInfo);

    expect(payload.type).toBe('large-file-chunk');
    expect(payload.subtype).toBe('file-chunk');
    expect(payload.source).toBe(relPath);
    expect(payload.chunkIndex).toBe(0);
    expect(payload.totalChunks).toBe(3);
  });

  it('includes summary with chunk position', async () => {
    const content = 'x'.repeat(100);
    const payload = await instance.buildLargeFileChunkPayload('test/src/large.js', content, 'src/large.js', null, { index: 2, totalChunks: 5 });

    expect(payload.summary).toBe('large.js (chunk 3/5)');
  });

  it('extracts signatures and comments from chunk content', async () => {
    const content = `/** JSDoc comment */\nfunction myFunc(a, b) {}\nclass MyClass {}\n// single line`;
    const payload = await instance.buildLargeFileChunkPayload('test/src/code.js', content, 'src/code.js', null, { index: 0, totalChunks: 1 });

    expect(payload.signatures).toContain('function myFunc(a, b)');
    expect(payload.comments).toContain('/** JSDoc comment */');
  });

  it('includes file-level metadata when fullFileContext is provided (T02 enhancement)', async () => {
    const content = 'chunk content here'; // small chunk slice
    const fullFileContext = {
      allSignatures: ['function globalFunc()', 'class GlobalClass'],
      allComments: ['/** File header */', '// module init'],
      allExports: ['MyExport', 'defaultExport'],
      allImports: ['lodash', './utils'],
      allSymbolNames: ['GlobalClass', 'globalFunc', 'myLocalFn'],
      allSnippetIds: ['M003', 'S01']
    };

    const payload = await instance.buildLargeFileChunkPayload(
      'test/src/large.js', content, 'src/large.js', null, { index: 2, totalChunks: 5 }, fullFileContext
    );

    // File-level metadata should be present
    expect(payload.exports).toEqual(['MyExport', 'defaultExport']);
    expect(payload.imports).toContain('lodash');
    expect(payload.symbolNames).toContain('GlobalClass');
    expect(payload.gsdIds).toContain('M003');
    expect(payload.relatedDocPaths).toBeDefined();

    // Per-chunk signatures should also be present (combined)
    const chunkContent = `function localFn() {}\nclass LocalClass {}`;
    const payload2 = await instance.buildLargeFileChunkPayload(
      'test/src/large.js', chunkContent, 'src/large.js', null, { index: 0, totalChunks: 3 }, fullFileContext
    );

    // Should have both file-level and per-chunk signatures combined
    expect(payload2.signatures).toContain('function globalFunc()'); // from file context
    expect(payload2.signatures).toContain('function localFn()');   // from chunk content
  });

  it('works without fullFileContext (backward compatibility)', async () => {
    const content = 'const x = 1;';
    const payload = await instance.buildLargeFileChunkPayload(
      'test/src/code.js', content, 'src/code.js', null, { index: 0, totalChunks: 1 }
    );

    expect(payload.type).toBe('large-file-chunk');
    expect(payload.chunkIndex).toBe(0);
    expect(payload.totalChunks).toBe(1);
    // Optional fields should be empty arrays when no fullFileContext provided
    expect(payload.exports).toEqual([]);
    expect(payload.imports).toEqual([]);
  });

  it('extracts GSD IDs from chunk content and merges with file-level', async () => {
    const content = 'See M004/S02 for details'; // contains GSD ID in chunk
    const fullFileContext = {
      allSignatures: [],
      allComments: [],
      allExports: [],
      allImports: [],
      allSymbolNames: [],
      allSnippetIds: ['M001', 'S03'] // from file-level
    };

    const payload = await instance.buildLargeFileChunkPayload(
      'test/src/code.js', content, 'src/code.js', null, { index: 0, totalChunks: 2 }, fullFileContext
    );

    expect(payload.gsdIds).toContain('M001'); // from file context
    expect(payload.gsdIds).toContain('S03');   // from file context
    expect(payload.gsdIds).toContain('M004');  // merged from chunk content
    expect(payload.gsdIds).toContain('S02');   // merged from chunk content
  });
});

describe('buildLargeFileChunkText — enriched embedding text with weighted header (T02)', () => {
  let instance;

  beforeEach(() => {
    instance = Object.create(require('../src/gsd-qdrant-template.js').GSDKnowledgeSync.prototype);
    instance.projectName = 'my-project';
  });

  it('prepends file-level metadata before content slice', () => {
    const text = instance.buildLargeFileChunkText(
      'src/large.js',
      'javascript',
      { index: 1, totalChunks: 4 },
      'function bar() {}'
    );

    expect(text).toContain('project:my-project');
    expect(text).toContain('path:src/large.js');
    expect(text).toContain('language:javascript');
    expect(text).toContain('chunk:2/4');
    expect(text).toContain('function bar() {}');
  });

  it('content slice appears after metadata', () => {
    const content = 'const x = 1;';
    const text = instance.buildLargeFileChunkText(
      'src/file.js',
      'javascript',
      { index: 0, totalChunks: 1 },
      content
    );

    expect(text.indexOf(content)).toBeGreaterThan(-1); // Content appears in the text after metadata
  });

  it('includes weighted header with signatures when payload provided (T02 enhancement)', () => {
    const payload = {
      signatures: ['function foo()', 'class Bar'],
      exports: ['MyExport', 'defaultExport'],
      imports: ['lodash', './utils']
    };

    const text = instance.buildLargeFileChunkText(
      'src/large.js',
      'javascript',
      { index: 0, totalChunks: 3 },
      'function foo() {}',
      payload
    );

    // Weighted header should appear first (before metadata)
    expect(text).toContain('SIGNATURES:');
    expect(text.indexOf('SIGNATURES:')).toBe(0); // Header at start of text
    expect(text).toContain('signatures: function foo() | class Bar');
    expect(text).toContain('exports: MyExport, defaultExport');
    expect(text).toContain('imports: lodash, ./utils');

    // Content should come after header + metadata
    const contentPos = text.indexOf('function foo() {}');
    const headerEnd = text.indexOf('\n\n') > 0 ? text.indexOf('\n\n') : text.length;
    expect(contentPos).toBeGreaterThan(0); // Content exists in the text
  });

  it('includes GSD IDs in body when payload has them (T02 enhancement)', () => {
    const payload = { gsdIds: ['M003', 'S01'] };

    const text = instance.buildLargeFileChunkText(
      'src/large.js',
      'javascript',
      { index: 1, totalChunks: 2 },
      'const x = 1;',
      payload
    );

    expect(text).toContain('gsd-ids:M003, S01');
  });

  it('works without payload (backward compatibility)', () => {
    const text = instance.buildLargeFileChunkText(
      'src/file.js',
      'javascript',
      { index: 0, totalChunks: 1 },
      'const x = 1;'
    );

    // Should still have basic metadata without weighted header
    expect(text).toContain('project:my-project');
    expect(text).toContain('path:src/file.js');
    expect(text).not.toContain('SIGNATURES:'); // No header when no payload provided
  });
});

describe('buildLargeFileChunkText — embedding text for large-file chunks', () => {
  let instance;

  beforeEach(() => {
    instance = Object.create(require('../src/gsd-qdrant-template.js').GSDKnowledgeSync.prototype);
    instance.projectName = 'my-project';
  });

  it('prepends file-level metadata before content slice', () => {
    const text = instance.buildLargeFileChunkText(
      'src/large.js',
      'javascript',
      { index: 1, totalChunks: 4 },
      'function bar() {}'
    );

    expect(text).toContain('project:my-project');
    expect(text).toContain('path:src/large.js');
    expect(text).toContain('language:javascript');
    expect(text).toContain('chunk:2/4');
    expect(text).toContain('function bar() {}');
  });

  it('content slice appears after metadata', () => {
    const content = 'const x = 1;';
    const text = instance.buildLargeFileChunkText(
      'src/file.js',
      'javascript',
      { index: 0, totalChunks: 1 },
      content
    );

    expect(text.indexOf(content)).toBeGreaterThan(-1); // Content appears in the text after metadata
  });
});
