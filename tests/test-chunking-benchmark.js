const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function chunkFileContent(content, maxChars, overlapChars) {
  const chunks = [];
  if (content.length <= maxChars) {
    return [{ content, startLine: 1, endLine: countLines(content), fullContent: true }];
  }
  const lines = content.split('\n');
  const boundaryPositions = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^(export\s+)?(?:async\s+)?function\b/.test(line) || /^class\b[A-Za-z_$]/.test(line) || /^(const|let|var)\s+[A-Za-z_]\w*\s*=\s*(?:async\s+)?\(/.test(line)) {
      boundaryPositions.push({ lineIndex: i, charPos: charPositionAtLine(lines, i), text: line });
    }
  }
  let pos = 0;
  while (pos < content.length) {
    const remaining = content.slice(pos);
    if (remaining.length <= maxChars) {
      chunks.push({ content: remaining, startLine: lineNumberAtChar(content, pos), endLine: countLines(remaining), fullContent: false });
      break;
    }
    const searchStart = Math.floor(pos + maxChars * 0.4);
    const searchEnd = Math.min(pos + Math.floor(maxChars * 0.85), content.length - overlapChars);
    let bestBoundaryIdx = null;
    let bestBoundaryDist = Infinity;
    for (const bp of boundaryPositions) {
      if (bp.charPos < searchStart || bp.charPos > searchEnd) continue;
      const midPoint = Math.floor((searchStart + searchEnd) / 2);
      const distFromMid = Math.abs(bp.charPos - midPoint);
      if (distFromMid < bestBoundaryDist) { bestBoundaryIdx = bp; bestBoundaryDist = distFromMid; }
    }
    let splitAt;
    if (bestBoundaryIdx !== null && bestBoundaryDist <= maxChars * 0.35) {
      const ctxLinesBefore = Math.min(2, bestBoundaryIdx.lineIndex);
      splitAt = charPositionAtLine(lines, bestBoundaryIdx.lineIndex - ctxLinesBefore);
    } else if (bestBoundaryIdx !== null) {
      const ctxLinesBefore = Math.min(2, bestBoundaryIdx.lineIndex);
      splitAt = charPositionAtLine(lines, bestBoundaryIdx.lineIndex - ctxLinesBefore);
    } else {
      splitAt = pos + Math.floor(maxChars * 0.85);
      const afterCut = content.slice(splitAt, splitAt + 100);
      const newLineIdx = afterCut.indexOf('\n');
      if (newLineIdx > 0 && newLineIdx < 50) { splitAt += newLineIdx; }
      else {
        const prevNewline = content.lastIndexOf('\n', splitAt - 1);
        if (prevNewline > pos + maxChars * 0.5) { splitAt = prevNewline; }
      }
    }
    const chunkContent = content.slice(pos, splitAt);
    chunks.push({ content: chunkContent, startLine: lineNumberAtChar(content, pos), endLine: lineNumberAtChar(content, Math.min(splitAt - 1, content.length)), fullContent: false });
    pos = splitAt - overlapChars;
  }
  return chunks;
}
function charPositionAtLine(lines, lineIndex) {
  let pos = 0;
  for (let i = 0; i < Math.min(lineIndex, lines.length - 1); i++) { pos += lines[i].length + 1; }
  return pos;
}
function lineNumberAtChar(content, charPos) {
  let line = 1;
  for (let i = 0; i < Math.min(charPos, content.length); i++) { if (content[i] === '\n') line++; }
  return line;
}
function countLines(text) {
  const nlCount = (text.match(/\n/g) || []).length;
  if (text.length > 0 && !text.endsWith('\n')) return nlCount + 1;
  return Math.max(nlCount, 1);
}

const CONFIGURATIONS = [
  { maxChars: 800, overlap: 100, label: '800/100' },
  { maxChars: 1500, overlap: 200, label: '1500/200 (current)' },
  { maxChars: 2000, overlap: 250, label: '2000/250' },
  { maxChars: 3000, overlap: 300, label: '3000/300' },
];
const SRC_DIR = path.join(__dirname, '..', 'src');
const JS_FILES = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.js')).map(f => path.join(SRC_DIR, f));

test('benchmark: chunking configurations comparison', () => {
  const results = [];
  for (const config of CONFIGURATIONS) {
    let totalChunks = 0; let totalChars = 0; let boundaryPreserved = 0;
    const fileStats = [];
    for (const filePath of JS_FILES) {
      const content = fs.readFileSync(filePath, 'utf8');
      const chunks = chunkFileContent(content, config.maxChars, config.overlap);
      let fileChunks = 0; let fileChars = 0; let fileBoundaryPreserved = 0;
      for (const chunk of chunks) {
        fileChunks++; fileChars += chunk.content.length;
        const firstLine = chunk.content.split('\n')[0];
        if (/^(export\s+)?(?:async\s+)?function\b/.test(firstLine) || /^class\b[A-Za-z_$]/.test(firstLine) || /^(const|let|var)\s+[A-Za-z_]\w*\s*=\s*(?:async\s+)?\(/.test(firstLine)) { fileBoundaryPreserved++; }
      }
      totalChunks += fileChunks; totalChars += fileChars; boundaryPreserved += fileBoundaryPreserved;
      fileStats.push({ file: path.relative(SRC_DIR, filePath), size: content.length, chunks: fileChunks, avgChunkSize: Math.round(fileChars / fileChunks) });
    }
    const avgChunkSize = Math.round(totalChars / totalChunks);
    const overlapRatio = ((config.overlap / config.maxChars) * 100).toFixed(1);
    const boundaryRate = ((boundaryPreserved / totalChunks) * 100).toFixed(1);
    const metadataChars = 250;
    const embeddingSize = avgChunkSize + metadataChars;
    results.push({ config: config.label, maxChars: config.maxChars, overlap: config.overlap, totalChunks, avgChunkSize, boundaryRate, overlapRatio, estimatedEmbeddingSize: embeddingSize, files: fileStats });
  }
  console.log(JSON.stringify({ benchmark: results }, null, 2));
  for (const result of results) {
    assert.ok(result.totalChunks > 0, `Config ${result.config} should produce chunks`);
    assert.ok(result.avgChunkSize > 0, `Config ${result.config} should have positive avg chunk size`);
    assert.ok(result.avgChunkSize <= result.maxChars, `Config ${result.config} avg chunk (${result.avgChunkSize}) should not exceed max (${result.maxChars})`);
  }
  const currentConfig = results.find(r => r.config === '1500/200 (current)');
  assert.ok(currentConfig, 'Current config should be in results');
  assert.ok(currentConfig.totalChunks > 5, 'Current config should produce multiple chunks');
});

test('benchmark: small files should not be chunked', () => {
  const smallContent = 'function hello() { return "world"; }';
  const chunks = chunkFileContent(smallContent, 1500, 200);
  assert.strictEqual(chunks.length, 1, 'Small file should produce exactly 1 chunk');
  assert.strictEqual(chunks[0].fullContent, true, 'Small file chunk should be marked as fullContent');
  assert.strictEqual(chunks[0].content, smallContent, 'Small file chunk should contain full content');
});

test('benchmark: overlap should create content overlap between adjacent chunks', () => {
  const lines = [];
  for (let i = 0; i < 100; i++) { lines.push(`function func${i}() { return ${i}; }`); }
  const content = lines.join('\n');
  const chunks = chunkFileContent(content, 500, 50);
  assert.ok(chunks.length > 1, 'Large file should produce multiple chunks');
  for (let i = 0; i < chunks.length - 1; i++) {
    const chunkA = chunks[i].content;
    const chunkB = chunks[i + 1].content;
    const overlapA = chunkA.slice(-50);
    const overlapB = chunkB.slice(0, 50);
    assert.strictEqual(overlapA, overlapB, `Overlap between chunk ${i} and ${i + 1} should match`);
  }
});

test('benchmark: token budget analysis', () => {
  const configs = [
    { maxChars: 800, overlap: 100, label: '800/100' },
    { maxChars: 1500, overlap: 200, label: '1500/200 (current)' },
    { maxChars: 2000, overlap: 250, label: '2000/250' },
    { maxChars: 3000, overlap: 300, label: '3000/300' },
  ];
  for (const config of configs) {
    const avgChunkSize = Math.round(config.maxChars * 0.7);
    const metadataChars = 250;
    const totalChunkChars = avgChunkSize + metadataChars;
    const trimmedChars = Math.min(totalChunkChars, 500);
    const estimatedTokens = Math.ceil(trimmedChars / 4);
    const cliTotalTokens = estimatedTokens * 5;
    const mcpTotalTokens = estimatedTokens * 3;
    console.log(`Config ${config.label}: avg=${avgChunkSize}, total=${totalChunkChars}, trimmed=${trimmedChars}, tokens/result=${estimatedTokens}, CLI=${cliTotalTokens}, MCP=${mcpTotalTokens}`);
    assert.ok(cliTotalTokens <= 5000, `Config ${config.label} CLI token total should be reasonable`);
    assert.ok(mcpTotalTokens <= 3000, `Config ${config.label} MCP token total should be reasonable`);
  }
});
