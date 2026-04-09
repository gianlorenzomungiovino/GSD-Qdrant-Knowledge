#!/usr/bin/env node

const { QdrantClient } = require('@qdrant/js-client-rest');
const { promises: fs, existsSync } = require('fs');
const { join, basename, extname, relative } = require('path');
const crypto = require('crypto');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const PROJECT_ROOT = process.cwd();
const STATE_FILE = join(PROJECT_ROOT, 'gsd-qdrant', '.qdrant-sync-state.json');

const EXCLUDED_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'bower_components', '.next', 'dist', 'build', 'coverage', '.turbo', '.vercel', '.idea', '.vscode', '.bg-shell', 'gsd-qdrant',
]);
const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.rb', '.php', '.go', '.rs', '.java', '.kt', '.scala', '.cs', '.html', '.css', '.scss', '.sass', '.less', '.sql', '.sh', '.bash', '.zsh', '.ps1', '.json', '.yaml', '.yml', '.toml', '.xml', '.swift', '.dart', '.vue', '.svelte', '.astro'
]);
const EXCLUDED_FILE_EXTENSIONS = new Set([
  '.md', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf', '.zip', '.gz', '.tar', '.mp3', '.mp4', '.mov', '.woff', '.woff2', '.ttf', '.env', '.lock', '.log'
]);

class GSDKnowledgeSync {
  constructor() {
    this.client = new QdrantClient({ url: QDRANT_URL });
    this.projectName = basename(PROJECT_ROOT);
    this.collections = {
      docs: `${this.projectName}-docs`,
      snippets: `${this.projectName}-snippets`,
    };
    this.vectorName = process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2';
    this.embeddingDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '384', 10);
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
    this.pipeline = null;
  }

  async init() {
    for (const collectionName of Object.values(this.collections)) {
      await this.ensureCollection(collectionName);
    }
    try {
      const { pipeline } = require('@xenova/transformers');
      this.pipeline = await pipeline('feature-extraction', this.embeddingModel);
    } catch (err) {
      if (process.env.GSD_QDRANT_VERBOSE === '1') {
        console.warn('⚠️  Transformers not available, using placeholder embeddings');
      }
    }
  }

  async ensureCollection(collectionName) {
    try {
      const existing = await this.client.getCollection(collectionName);
      const vectors = existing?.config?.params?.vectors;
      const namedVector = vectors && !Array.isArray(vectors) ? vectors[this.vectorName] : null;
      if (!namedVector) throw new Error(`Collection ${collectionName} exists without named vector ${this.vectorName}. Recreate it.`);
      if (namedVector.size !== this.embeddingDimensions) throw new Error(`Collection ${collectionName} uses size ${namedVector.size}, expected ${this.embeddingDimensions}.`);
      return;
    } catch (err) {
      if (err.status === 404) {
        await this.client.createCollection(collectionName, {
          vectors: { [this.vectorName]: { size: this.embeddingDimensions, distance: 'Cosine' } },
        });
        return;
      }
      throw err;
    }
  }

  async syncAll() {
    const docsSummary = await this.syncDocs();
    const snippetsSummary = await this.syncSnippets();
    console.log(`✅ Sync complete! docs=${docsSummary.total} snippets=${snippetsSummary.total}`);
    return { docsSummary, snippetsSummary };
  }

  async syncDocs() {
    console.log('📄 Syncing GSD documentation...');
    const gsdDir = join(PROJECT_ROOT, '.gsd');
    const syncState = await this.loadSyncState();
    const docsState = syncState.docs || {};
    if (!existsSync(gsdDir)) {
      console.log('  ℹ️  .gsd directory not found');
      syncState.docs = docsState;
      await this.saveSyncState(syncState);
      return { total: 0, updated: 0, deleted: 0 };
    }
    const files = await this.walkGsd(gsdDir);
    console.log(`📄 Docs: ${files.length} files`);
    const seenIds = new Set();
    let updated = 0;
    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf8');
      const relPath = this.toProjectRelative(filePath);
      const id = this.makePointId('docs', relPath);
      const hash = this.hashContent(content);
      seenIds.add(String(id));
      if (docsState[id]?.hash === hash) continue;
      const metadata = this.extractMetadata(filePath, content);
      const vector = await this.embedText(this.buildDocText(relPath, content, metadata));
      await this.upsertPoint(this.collections.docs, {
        id,
        vector: { [this.vectorName]: vector },
        payload: { kind: 'docs', project: this.projectName, path: relPath, hash, title: metadata.title || basename(filePath), date: metadata.date || null, content, ids: this.extractGsdIds(relPath, content), linksTo: this.extractReferencedPaths(content) },
      });
      docsState[id] = { path: relPath, hash };
      updated += 1;
    }
    const deleted = await this.deleteMissingPoints(this.collections.docs, docsState, seenIds);
    syncState.docs = docsState;
    syncState.lastSync = new Date().toISOString();
    await this.saveSyncState(syncState);
    console.log(`  ✅ Updated ${updated}, deleted ${deleted}`);
    return { total: files.length, updated, deleted };
  }

  async syncSnippets() {
    console.log('🔧 Syncing code snippets...');
    const syncState = await this.loadSyncState();
    const snippetsState = syncState.snippets || {};
    const gsdDir = join(PROJECT_ROOT, '.gsd');
    const files = await this.walkProjectCode(PROJECT_ROOT);
    console.log(`🔧 Snippets: ${files.length} files`);
    const docIndex = existsSync(gsdDir) ? await this.buildDocReferenceIndex(gsdDir) : { allDocs: [] };
    const seenIds = new Set();
    let updated = 0;
    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf8');
      const relPath = this.toProjectRelative(filePath);
      const id = this.makePointId('snippets', relPath);
      const hash = this.hashContent(content);
      seenIds.add(String(id));
      if (snippetsState[id]?.hash === hash) continue;
      const contextRefs = this.findRelevantDocsForSnippet(relPath, content, docIndex);
      const codeMetadata = this.extractCodeMetadata(filePath, content, relPath);
      const payload = {
        kind: 'snippet', project: this.projectName, path: relPath, hash,
        language: this.detectLanguage(filePath), scope: this.detectScope(relPath), ids: this.extractGsdIds(relPath, content),
        name: codeMetadata.name,
        symbolNames: codeMetadata.symbolNames,
        exports: codeMetadata.exports,
        imports: codeMetadata.imports,
        workspace: codeMetadata.workspace,
        kindDetail: codeMetadata.kindDetail,
        relatedDocs: contextRefs.map((doc) => ({ path: doc.path, title: doc.title || basename(doc.path), ids: doc.ids, reason: doc.reason })),
        relatedDocPaths: contextRefs.map((doc) => doc.path),
        relatedDocIds: [...new Set(contextRefs.flatMap((doc) => doc.ids))],
        content,
      };
      const vector = await this.embedText(this.buildSnippetText(relPath, content, payload));
      await this.upsertPoint(this.collections.snippets, { id, vector: { [this.vectorName]: vector }, payload });
      snippetsState[id] = { path: relPath, hash };
      updated += 1;
    }
    const deleted = await this.deleteMissingPoints(this.collections.snippets, snippetsState, seenIds);
    syncState.snippets = snippetsState;
    syncState.lastSync = new Date().toISOString();
    await this.saveSyncState(syncState);
    console.log(`  ✅ Updated ${updated}, deleted ${deleted}`);
    return { total: files.length, updated, deleted };
  }

  async searchWithContext(query, options = {}) {
    const limit = options.limit || 10;
    const vector = await this.embedText(query);
    const snippetHits = await this.client.search(this.collections.snippets, { vector: { name: this.vectorName, vector }, limit, with_payload: true, with_vector: false });
    if (!options.withContext) return snippetHits.map((hit) => ({ score: hit.score, ...hit.payload }));
    const docPaths = [...new Set(snippetHits.flatMap((hit) => hit.payload?.relatedDocPaths || []))];
    const docPayloads = [];
    for (const path of docPaths.slice(0, limit * 3)) {
      const id = this.makePointId('docs', path);
      try {
        const response = await this.client.retrieve(this.collections.docs, { ids: [id], with_payload: true, with_vector: false });
        if (response?.[0]?.payload) docPayloads.push(response[0].payload);
      } catch (_) {}
    }
    return snippetHits.map((hit) => ({ score: hit.score, ...hit.payload, context: docPayloads.filter((doc) => (hit.payload?.relatedDocPaths || []).includes(doc.path)).map((doc) => ({ source: doc.path, ids: doc.ids || [], title: doc.title })) }));
  }

  startWatcher() { console.log('👀 Watch mode not implemented yet. Run `gsd-qdrant` or `node scripts/sync-knowledge.js`.'); }
  async walkGsd(dir) { const files = []; for (const entry of await fs.readdir(dir, { withFileTypes: true })) { const fullPath = join(dir, entry.name); if (entry.isDirectory()) files.push(...await this.walkGsd(fullPath)); else if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath); } return files; }
  async walkProjectCode(dir) { const files = []; for (const entry of await fs.readdir(dir, { withFileTypes: true })) { const fullPath = join(dir, entry.name); if (entry.isDirectory()) { if (EXCLUDED_DIRS.has(entry.name)) continue; files.push(...await this.walkProjectCode(fullPath)); continue; } if (!entry.isFile()) continue; if (entry.name === 'package-lock.json') continue; const ext = extname(entry.name).toLowerCase(); if (EXCLUDED_FILE_EXTENSIONS.has(ext) || !CODE_EXTENSIONS.has(ext)) continue; files.push(fullPath); } return files; }
  async buildDocReferenceIndex(gsdDir) { const allDocs = []; for (const filePath of await this.walkGsd(gsdDir)) { const content = await fs.readFile(filePath, 'utf8'); const relPath = this.toProjectRelative(filePath); const title = this.extractMetadata(filePath, content).title || basename(filePath); const ids = this.extractGsdIds(relPath, content); const keywords = this.buildKeywords(relPath, content, ids); allDocs.push({ path: relPath, title, ids, keywords }); } return { allDocs }; }
  findRelevantDocsForSnippet(relPath, content, docIndex) { const snippetIds = new Set(this.extractGsdIds(relPath, content)); const lowerPath = relPath.toLowerCase(); const contentSlice = content.toLowerCase().slice(0, 4000); const scored = []; for (const doc of docIndex.allDocs) { let score = 0; const reasons = []; if (doc.ids.some((id) => snippetIds.has(id))) { score += 6; reasons.push('shared-gsd-id'); } for (const id of doc.ids) { if (lowerPath.includes(id.toLowerCase())) { score += 4; reasons.push('path-id-match'); break; } } for (const keyword of doc.keywords) { if (keyword.length < 4) continue; if (lowerPath.includes(keyword) || contentSlice.includes(keyword)) { score += 1; reasons.push(`keyword:${keyword}`); if (score >= 10) break; } } if (score > 0) scored.push({ ...doc, score, reason: [...new Set(reasons)].join(',') }); } scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)); return scored.slice(0, 5); }
  buildDocText(relPath, content, metadata) { return [`project:${this.projectName}`, `path:${relPath}`, metadata.title ? `title:${metadata.title}` : null, content].filter(Boolean).join('\n'); }
  buildSnippetText(relPath, content, payload) { const contextLine = payload.relatedDocPaths.length ? `related-docs:${payload.relatedDocPaths.join(', ')}` : null; const idsLine = payload.relatedDocIds.length ? `related-ids:${payload.relatedDocIds.join(', ')}` : null; const nameLine = payload.name ? `name:${payload.name}` : null; const symbolLine = payload.symbolNames?.length ? `symbols:${payload.symbolNames.join(', ')}` : null; const exportLine = payload.exports?.length ? `exports:${payload.exports.join(', ')}` : null; return [`project:${this.projectName}`, `path:${relPath}`, `language:${payload.language}`, `scope:${payload.scope}`, `workspace:${payload.workspace}`, `kind-detail:${payload.kindDetail}`, nameLine, symbolLine, exportLine, idsLine, contextLine, content].filter(Boolean).join('\n'); }
  async upsertPoint(collection, point) { await this.client.upsert(collection, { points: [point] }); }
  async deleteMissingPoints(collection, stateBucket, seenIds) { const deletedIds = Object.keys(stateBucket).filter((id) => !seenIds.has(String(id))); if (deletedIds.length) { await this.client.delete(collection, { points: deletedIds.map((id) => Number(id)) }); for (const id of deletedIds) delete stateBucket[id]; } return deletedIds.length; }
  async embedText(text) { if (this.pipeline) { const output = await this.pipeline(text, { pooling: 'mean', normalize: true }); return Array.from(output.data); } return this.generatePlaceholderEmbedding(text); }
  extractMetadata(filePath, content) { const metadata = { relativePath: this.toProjectRelative(filePath) }; const titleMatch = content.match(/^#\s+(.+)$/m); if (titleMatch) metadata.title = titleMatch[1].trim(); const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/); if (frontmatterMatch) { const dateMatch = frontmatterMatch[1].match(/date:\s+(.+)/); if (dateMatch) metadata.date = dateMatch[1].trim(); } return metadata; }
  extractGsdIds(relPath, content) { const matches = new Set(); for (const source of [relPath, content]) { const found = source.match(/\b(M\d{3}|S\d{2}|T\d{2}|R\d{3}|D\d{3})\b/g) || []; found.forEach((m) => matches.add(m)); } return [...matches]; }
  extractReferencedPaths(content) { return [...new Set(content.match(/[\w./-]+\.[a-z]{2,4}/gi) || [])].slice(0, 20); }
  buildKeywords(relPath, content, ids) { return [...new Set([relPath, ...ids, ...((content.match(/\b[a-zA-Z][a-zA-Z0-9_-]{3,}\b/g) || []).slice(0, 80))].map((value) => value.toLowerCase()))]; }
  detectLanguage(filePath) { const ext = extname(filePath).toLowerCase(); const byExt = { '.js':'javascript','.jsx':'javascript','.mjs':'javascript','.cjs':'javascript','.ts':'typescript','.tsx':'typescript','.py':'python','.rb':'ruby','.php':'php','.go':'go','.rs':'rust','.java':'java','.kt':'kotlin','.cs':'csharp','.swift':'swift','.html':'html','.css':'css','.scss':'scss','.sql':'sql','.sh':'shell','.bash':'shell','.zsh':'shell','.ps1':'powershell','.json':'json','.yaml':'yaml','.yml':'yaml','.vue':'vue','.svelte':'svelte','.astro':'astro' }; return byExt[ext] || ext.replace('.', '') || 'text'; }
  detectScope(relPath) { const path = relPath.replace(/\\/g, '/').toLowerCase(); if (path.includes('/test') || path.includes('.test.') || path.includes('.spec.')) return 'test'; if (path.includes('/scripts/')) return 'script'; if (path.includes('/components/')) return 'component'; if (path.includes('/pages/') || path.includes('/app/')) return 'page'; if (path.includes('/api/') || path.includes('/routes/')) return 'api'; return 'code'; }
  extractCodeMetadata(filePath, content, relPath) { const baseName = basename(filePath, extname(filePath)); const exportMatches = [...content.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)?\s*([A-Za-z_][\w$]*)?/g)].map((m) => m[1]).filter(Boolean); const commonJsExports = [...content.matchAll(/module\.exports\s*=\s*([A-Za-z_][\w$]*)|exports\.([A-Za-z_][\w$]*)\s*=/g)].map((m) => m[1] || m[2]).filter(Boolean); const importMatches = [...content.matchAll(/import\s+(?:[^'"\n]+\s+from\s+)?['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1] || m[2]).filter(Boolean); const symbolNames = [...new Set([
    ...exportMatches,
    ...commonJsExports,
    ...[...content.matchAll(/(?:function|class|const)\s+([A-Za-z_][\w$]*)/g)].slice(0, 20).map((m) => m[1]),
  ])]; const scope = this.detectScope(relPath); const workspace = relPath.split('/')[0] || '.'; const name = symbolNames[0] || baseName; let kindDetail = scope; if (/\.tsx?$/.test(filePath) && /<[A-Z][A-Za-z0-9]*/.test(content)) kindDetail = 'react-component'; else if (scope === 'api') kindDetail = 'api-module'; else if (scope === 'script') kindDetail = 'script'; else if (/use[A-Z]/.test(name)) kindDetail = 'hook'; return { name, symbolNames, exports: [...new Set([...exportMatches, ...commonJsExports])], imports: [...new Set(importMatches)].slice(0, 50), workspace, kindDetail }; }
  generatePlaceholderEmbedding(content) { const hash = crypto.createHash('md5').update(content).digest('hex'); const vector = new Array(this.embeddingDimensions).fill(0); for (let i = 0; i < this.embeddingDimensions; i++) { const startIdx = (i * 4) % hash.length; const hashPart = hash.substring(startIdx, startIdx + 4) || hash.substring(0, 4); vector[i] = parseInt(hashPart, 16) / 0xffff; } const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)); if (norm > 0 && !Number.isNaN(norm)) for (let i = 0; i < this.embeddingDimensions; i++) vector[i] /= norm; return vector; }
  makePointId(kind, relPath) { return parseInt(crypto.createHash('md5').update(`${kind}:${relPath}`).digest('hex').substring(0, 8), 16); }
  hashContent(content) { return crypto.createHash('md5').update(content).digest('hex'); }
  toProjectRelative(filePath) { return relative(PROJECT_ROOT, filePath).replace(/\\/g, '/'); }
  async loadSyncState() { try { return JSON.parse(await fs.readFile(STATE_FILE, 'utf8')); } catch (_) { return { lastSync: null, docs: {}, snippets: {} }; } }
  async saveSyncState(state) { await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2)); }
}

module.exports = { GSDKnowledgeSync };
