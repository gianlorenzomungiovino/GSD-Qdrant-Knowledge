#!/usr/bin/env node

const { QdrantClient } = require('@qdrant/js-client-rest');
const { promises: fs, existsSync } = require('fs');
const { join, basename, extname, relative } = require('path');
const crypto = require('crypto');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const PROJECT_ROOT = process.cwd();
const STATE_FILE = join(PROJECT_ROOT, 'gsd-qdrant-knowledge', '.qdrant-sync-state.json');

const EXCLUDED_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'bower_components', '.next', 'dist', 'build', 'coverage', '.turbo', '.vercel', '.idea', '.vscode', '.bg-shell', 'gsd-qdrant-knowledge',
]);
const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.rb', '.php', '.go', '.rs', '.java', '.kt', '.scala', '.cs', '.html', '.css', '.scss', '.sass', '.less', '.sql', '.sh', '.bash', '.zsh', '.ps1', '.json', '.yaml', '.yml', '.toml', '.xml', '.swift', '.dart', '.vue', '.svelte', '.astro'
]);
const EXCLUDED_FILE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf', '.zip', '.gz', '.tar', '.mp3', '.mp4', '.mov', '.woff', '.woff2', '.ttf', '.env', '.lock', '.log'
]);

// Files managed by GSD locally - exclude from Qdrant to avoid duplicate context
// GSD is the source of truth for the current project; Qdrant is an enhancer for cross-project sharing
const GSD_PROJECT_FILES = new Set([
  'STATE.md',
  'REQUIREMENTS.md',
  'DECISIONS.md',
  'KNOWLEDGE.md',
  'PROJECT.md',
  'FUTURE-REQUIREMENTS.md'
]);

class GSDKnowledgeSync {
  constructor() {
    this.client = new QdrantClient({ url: QDRANT_URL });
    this.projectName = basename(PROJECT_ROOT);
    this.collectionName = 'gsd_memory'; // Unified collection for all projects
    this.vectorName = process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2';
    this.embeddingDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '1024', 10);
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
    this.pipeline = null;
  }

  async init() {
    await this.ensureCollection(this.collectionName);
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
    const summary = await this.syncToGsdMemory();
    console.log(`✅ Sync complete! Total points indexed: ${summary.total}`);
    return summary;
  }

  indexedFileKey(relPath) {
    return `indexed_${relPath.replace(/\//g, '_').replace(/\\/g, '_')}`;
  }

  async syncToGsdMemory() {
    console.log('📦 Syncing to unified gsd_memory collection...');
    const gsdDir = join(PROJECT_ROOT, '.gsd');
    const hasGsdDir = existsSync(gsdDir);

    if (!hasGsdDir) {
      console.log('  ℹ️  .gsd directory not found - indexing code only');
    }

    const mdFiles = hasGsdDir ? await this.walkGsd(gsdDir) : [];
    const codeFiles = await this.walkProjectCode(PROJECT_ROOT);
    
    console.log(`📄 Found ${mdFiles.length} documentation files to index`);
    console.log(`💻 Found ${codeFiles.length} code files to index`);
    
    // First, build the document reference index (for finding related docs)
    const docIndex = hasGsdDir ? await this.buildDocReferenceIndex(gsdDir) : [];
    
    const seenIds = new Set();
    let updated = 0;
    const syncState = await this.loadSyncState();
    
    // Index documentation files (.md)
    for (const filePath of mdFiles) {
      const content = await fs.readFile(filePath, 'utf8');
      const relPath = this.toProjectRelative(filePath);
      const id = this.makePointId('doc', relPath);
      const hash = this.hashContent(content);
      seenIds.add(relPath);
      
      // Check if already indexed
      if (syncState[this.indexedFileKey(relPath)]?.hash === hash) continue;
      
      const payload = await this.buildDocPayload(filePath, content, relPath, content);
      const vector = await this.embedText(this.buildDocText(relPath, content, payload));
      
      await this.client.upsert(this.collectionName, { points: [{ id, vector: { [this.vectorName]: vector }, payload }] });
      syncState[this.indexedFileKey(relPath)] = { path: relPath, hash };
      updated += 1;
    }
    
    // Index code files (with related docs)
    for (const filePath of codeFiles) {
      const content = await fs.readFile(filePath, 'utf8');
      const relPath = this.toProjectRelative(filePath);
      const id = this.makePointId('code', relPath);
      const hash = this.hashContent(content);
      seenIds.add(relPath);
      
      // Check if already indexed
      if (syncState[this.indexedFileKey(relPath)]?.hash === hash) continue;
      
      const payload = await this.buildCodePayload(filePath, content, relPath, docIndex);
      const vector = await this.embedText(this.buildCodeText(relPath, content, payload));
      
      await this.client.upsert(this.collectionName, { points: [{ id, vector: { [this.vectorName]: vector }, payload }] });
      syncState[this.indexedFileKey(relPath)] = { path: relPath, hash };
      updated += 1;
    }
    
    const deleted = await this.deleteMissingPoints(seenIds, syncState);
    syncState.lastSync = new Date().toISOString();
    await this.saveSyncState(syncState);
    
    console.log(`  ✅ Updated ${updated}, deleted ${deleted}`);
    return { total: mdFiles.length + codeFiles.length, updated, deleted };
  }

  async searchWithContext(query, options = {}) {
    const limit = options.limit || 10;
    const vector = await this.embedText(query);
    
    // Search without filter first
    const hits = await this.client.search(this.collectionName, { 
      vector: { name: this.vectorName, vector }, 
      limit,
      with_payload: true, 
      with_vector: false
    });
    
    // Filter results locally
    let filtered = hits;
    if (options.type) {
      filtered = filtered.filter(h => h.payload.type === options.type);
    }
    
    return filtered.map((hit) => ({ score: hit.score, ...hit.payload }));
  }

  async indexFile(filePath, syncState, seenIds, fileType, count, docIndex = null) {
    const content = await fs.readFile(filePath, 'utf8');
    const relPath = this.toProjectRelative(filePath);
    const id = this.makePointId(fileType, relPath);
    const hash = this.hashContent(content);
    seenIds.add(relPath);
    
    // Check if already indexed
    if (syncState[this.indexedFileKey(relPath)]?.hash === hash) return;
    
    // Build payload based on file type
    const payload = fileType === 'doc' 
      ? await this.buildDocPayload(filePath, content, relPath, content)
      : await this.buildCodePayload(filePath, content, relPath, docIndex);
    
    const vector = await this.embedText(fileType === 'doc' 
      ? this.buildDocText(relPath, content, metadata || {})
      : this.buildCodeText(relPath, content, payload)
    );
    
    await this.client.upsert(this.collectionName, { points: [{ id, vector: { [this.vectorName]: vector }, payload }] });
    syncState[this.indexedFileKey(relPath)] = { path: relPath, hash };
  }

  startWatcher() { console.log('👀 Watch mode not implemented yet. Run `gsd-qdrant-knowledge` or `node src/sync-knowledge.js`.'); }
  async walkGsd(dir) {
    const files = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.walkGsd(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Skip GSD project files - they are managed locally by GSD
        // GSD is the source of truth for the current project; Qdrant is an enhancer
        if (GSD_PROJECT_FILES.has(entry.name)) {
          continue;
        }
        files.push(fullPath);
      }
    }
    return files;
  }
  async walkProjectCode(dir) {
    const files = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        files.push(...await this.walkProjectCode(fullPath));
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name === 'package-lock.json') continue;
      const ext = extname(entry.name).toLowerCase();
      if (EXCLUDED_FILE_EXTENSIONS.has(ext) || !CODE_EXTENSIONS.has(ext)) continue;
      
      // Also skip GSD project files found in project root
      if (entry.name.endsWith('.md') && !this.shouldIndexGsdFile(entry.name)) {
        continue;
      }
      
      files.push(fullPath);
    }
    return files;
  }
  async buildDocReferenceIndex(gsdDir) {
    const allDocs = [];
    for (const filePath of await this.walkGsd(gsdDir)) {
      const content = await fs.readFile(filePath, 'utf8');
      const relPath = this.toProjectRelative(filePath);
      const title = this.extractMetadata(filePath, content).title || basename(filePath);
      const ids = this.extractGsdIds(relPath, content);
      const keywords = this.buildKeywords(relPath, content, ids);
      allDocs.push({ path: relPath, title, ids, keywords });
    }
    return allDocs;
  }
  
  /**
   * Check if a .md file should be indexed in Qdrant
   * GSD project files are managed locally - Qdrant is for cross-project sharing only
   */
  shouldIndexGsdFile(filePath) {
    const basename = filePath.split(/[/\\]/).pop();
    return !GSD_PROJECT_FILES.has(basename);
  }
  findRelatedDocsForCode(codeRelPath, codeContent, docIndex) {
    const codeIds = new Set(this.extractGsdIds(codeRelPath, codeContent));
    const lowerPath = codeRelPath.toLowerCase();
    const contentSlice = codeContent.toLowerCase().slice(0, 4000);
    const scored = [];
    for (const doc of docIndex) {
      let score = 0;
      const reasons = [];
      if (doc.ids.some((id) => codeIds.has(id))) {
        score += 6;
        reasons.push('shared-gsd-id');
      }
      for (const id of doc.ids) {
        if (lowerPath.includes(id.toLowerCase())) {
          score += 4;
          reasons.push('path-id-match');
          break;
        }
      }
      for (const keyword of doc.keywords) {
        if (keyword.length < 4) continue;
        if (lowerPath.includes(keyword) || contentSlice.includes(keyword)) {
          score += 1;
          reasons.push(`keyword:${keyword}`);
          if (score >= 10) break;
        }
      }
      if (score > 0) scored.push({ ...doc, score, reason: [...new Set(reasons)].join(',') });
    }
    scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    return scored.slice(0, 5);
  }
  findRelevantDocsForSnippet(relPath, content, docIndex) { const snippetIds = new Set(this.extractGsdIds(relPath, content)); const lowerPath = relPath.toLowerCase(); const contentSlice = content.toLowerCase().slice(0, 4000); const scored = []; for (const doc of docIndex.allDocs) { let score = 0; const reasons = []; if (doc.ids.some((id) => snippetIds.has(id))) { score += 6; reasons.push('shared-gsd-id'); } for (const id of doc.ids) { if (lowerPath.includes(id.toLowerCase())) { score += 4; reasons.push('path-id-match'); break; } } for (const keyword of doc.keywords) { if (keyword.length < 4) continue; if (lowerPath.includes(keyword) || contentSlice.includes(keyword)) { score += 1; reasons.push(`keyword:${keyword}`); if (score >= 10) break; } } if (score > 0) scored.push({ ...doc, score, reason: [...new Set(reasons)].join(',') }); } scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)); return scored.slice(0, 5); }
  buildDocText(relPath, content, metadata) { return [`project:${this.projectName}`, `path:${relPath}`, metadata.title ? `title:${metadata.title}` : null, content].filter(Boolean).join('\n'); }
  buildSnippetText(relPath, content, payload) { const contextLine = payload.relatedDocPaths.length ? `related-docs:${payload.relatedDocPaths.join(', ')}` : null; const idsLine = payload.relatedDocIds.length ? `related-ids:${payload.relatedDocIds.join(', ')}` : null; const nameLine = payload.name ? `name:${payload.name}` : null; const symbolLine = payload.symbolNames?.length ? `symbols:${payload.symbolNames.join(', ')}` : null; const exportLine = payload.exports?.length ? `exports:${payload.exports.join(', ')}` : null; return [`project:${this.projectName}`, `path:${relPath}`, `language:${payload.language}`, `scope:${payload.scope}`, `workspace:${payload.workspace}`, `kind-detail:${payload.kindDetail}`, nameLine, symbolLine, exportLine, idsLine, contextLine, content].filter(Boolean).join('\n'); }
  async upsertPoint(collection, point) { await this.client.upsert(collection, { points: [point] }); }
  async deleteMissingPoints(seenIds, syncState) {
    const deletedIds = Object.keys(syncState).filter((key) => {
      // Protect reserved keys that are not file indices
      if (key === 'lastSync' || key === 'indexed') return false;
      // This is a file index key (indexed_<path>), check if file still exists
      // Transform path the same way indexedFileKey does: replace slashes with underscores
      // Need to try both forward and backward slashes since we lost that info
      const relPath = key.replace('indexed_', '').replace(/_/g, '\\');
      const relPathAlt = key.replace('indexed_', '').replace(/_/g, '/');
      return !seenIds.has(relPath) && !seenIds.has(relPathAlt);
    });
    if (deletedIds.length) {
      const pointsToDelete = deletedIds.map((key) => {
        const relPath = key.replace('indexed_', '');
        return this.makePointId(relPath);
      });
      await this.client.delete(this.collectionName, { points: pointsToDelete });
      for (const id of deletedIds) delete syncState[id];
    }
    return deletedIds.length;
  }

  inferType(filePath, content) {
    if (filePath.includes('STATE.md')) return 'state';
    if (filePath.includes('REQUIREMENTS.md')) return 'requirements';
    if (filePath.includes('DECISIONS.md')) return 'decision';
    if (filePath.includes('KNOWLEDGE.md')) return 'knowledge';
    if (content.includes('## Active Milestone') || content.includes('## Current State')) return 'activity';
    return 'context';
  }

  async buildDocPayload(filePath, content, relPath, fullContent) {
    const metadata = this.extractMetadata(filePath, content);
    return {
      project_id: this.projectName,
      type: 'doc',
      subtype: this.inferType(filePath, content),
      source: relPath,
      section: this.inferSection(content),
      content: content,
      summary: metadata.title || basename(filePath),
      language: 'markdown',
      reusable: await this.isReusable(filePath, fullContent || content),
      tags: this.extractTags(content),
      importance: this.calculateImportance(filePath, content),
      timestamp: Date.now(),
      hash: this.hashContent(content)
    };
  }

  async buildCodePayload(filePath, content, relPath, docIndex = null) {
    const metadata = this.extractCodeMetadata(filePath, content, relPath);
    const lang = this.detectLanguage(filePath);
    
    // Extract only function/class signatures (not full body)
    const signatures = this.extractSignatures(content);
    
    // Extract comments (JSDoc, single-line, multi-line) - these act as semantic summaries
    const comments = this.extractComments(content);
    
    // Extract GSD IDs from code file (M003, S01, T02, etc.)
    const snippetIds = this.extractGsdIds(relPath, content);
    
    // Find related documentation files based on shared GSD IDs
    let relatedDocPaths = [];
    let relatedDocIds = [];
    if (docIndex && docIndex.length > 0) {
      const docMatches = this.findRelatedDocsForCode(relPath, content, docIndex);
      relatedDocPaths = docMatches.map(d => d.path);
      relatedDocIds = docMatches.flatMap(d => d.ids);
    }
    
    return {
      project_id: this.projectName,
      type: 'code',
      language: lang,
      source: relPath,
      summary: metadata.name || basename(filePath),
      kindDetail: metadata.kindDetail,
      scope: metadata.scope,
      workspace: metadata.workspace,
      content: content, // Keep full content for reference
      signatures: signatures, // Only signatures for embedding
      exports: metadata.exports,
      imports: metadata.imports,
      symbolNames: metadata.symbolNames,
      comments: comments, // JSDoc and comments for semantic context
      relatedDocPaths: relatedDocPaths, // Related documentation files
      relatedDocIds: relatedDocIds, // Related GSD IDs from docs
      timestamp: Date.now(),
      hash: this.hashContent(content)
    };
  }

  extractSignatures(content) {
    const signatures = [];
    
    // Function declarations: function name(params) { }
    const funcDecls = content.match(/function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)/g) || [];
    signatures.push(...funcDecls);
    
    // Class declarations: class Name { }
    const classDecls = content.match(/class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g) || [];
    signatures.push(...classDecls);
    
    // Method declarations: methodName(params) { }
    const methodDecls = content.match(/[A-Za-z_$][A-Za-z0-9_$]*\s*\([^)]*\)\s*{/g) || [];
    signatures.push(...methodDecls.filter(m => !m.includes('function') && !m.includes('class')));
    
    // Arrow functions: const name = (params) =>
    const arrowFuncs = content.match(/const\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*\([^)]*\)\s*=>/g) || [];
    signatures.push(...arrowFuncs);
    
    // Async functions: async function name
    const asyncFuncs = content.match(/async\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g) || [];
    signatures.push(...asyncFuncs);
    
    return [...new Set(signatures)].slice(0, 50); // Limit to avoid large embeddings
  }

  extractComments(content) {
    const comments = [];
    
    // JSDoc comments: /** ... */
    const jsdoc = content.match(/\/\*\*[\s\S]*?\*\/|\/\*\*[\s\S]*?\*$/g) || [];
    comments.push(...jsdoc);
    
    // Single-line comments: // ...
    const singleLine = content.match(/\/\/[^\n]{0,200}/g) || [];
    comments.push(...singleLine);
    
    // Multi-line comments: /* ... */
    const multiLine = content.match(/\/\*[\s\S]{0,500}\*\//g) || [];
    comments.push(...multiLine);
    
    return comments.slice(0, 30); // Limit to avoid large embeddings
  }

  inferSection(content) {
    if (content.includes('## Active Milestone')) return 'current_state';
    if (content.includes('## Milestone Registry')) return 'milestone_registry';
    if (content.includes('## Recent Decisions')) return 'recent_decisions';
    if (content.includes('## Blockers')) return 'blockers';
    if (content.includes('## Next Action')) return 'next_action';
    if (content.includes('## Requirements')) return 'requirements';
    if (content.includes('## Decisions')) return 'decisions';
    if (content.includes('## Knowledge')) return 'knowledge';
    return 'general';
  }

  async isReusable(filePath, content) {
    // For documentation files: DECISIONS.md and KNOWLEDGE.md are always reusable
    if (filePath.includes('DECISIONS.md') || filePath.includes('KNOWLEDGE.md')) {
      return true;
    }
    
    // For code files: consider reusable if the file exports something
    const ext = extname(filePath).toLowerCase();
    if (CODE_EXTENSIONS.has(ext)) {
      const hasExport = /export\s+(default\s+)?(?:async\s+)?(?:function|class|const|let|var)/.test(content);
      const hasModuleExports = /module\.exports\s*=/.test(content);
      const hasExports = /exports\.[A-Za-z_]/.test(content);
      
      if (hasExport || hasModuleExports || hasExports) {
        return true;
      }
    }
    
    return false;
  }

  extractTags(content) {
    const tags = [];
    if (content.includes('## Decisions')) tags.push('decision');
    if (content.includes('## Knowledge')) tags.push('knowledge');
    if (content.includes('Active Milestone')) tags.push('active');
    if (content.includes('## Requirements')) tags.push('requirements');
    return tags;
  }

  calculateImportance(filePath, content) {
    if (filePath.includes('STATE.md')) return 5;
    if (filePath.includes('REQUIREMENTS.md')) return 5;
    if (filePath.includes('DECISIONS.md')) return 4;
    if (filePath.includes('KNOWLEDGE.md')) return 3;
    return 2;
  }

  buildDocText(relPath, content, metadata) {
    return [`project:${this.projectName}`, `path:${relPath}`, metadata.title ? `title:${metadata.title}` : null, content].filter(Boolean).join('\n');
  }

  buildCodeText(relPath, content, payload) {
    // For code embedding, use signatures + comments (semantic summary)
    const sigText = payload.signatures.join('\n');
    const exportText = payload.exports ? `exports:${payload.exports.join(', ')}` : null;
    const importText = payload.imports ? `imports:${payload.imports.join(', ')}` : null;
    const symbolText = payload.symbolNames ? `symbols:${payload.symbolNames.join(', ')}` : null;
    const commentText = payload.comments ? `comments:${payload.comments.join(' | ')}` : null;
    
    return [
      `project:${this.projectName}`,
      `path:${relPath}`,
      `language:${payload.language}`,
      `kind:${payload.kindDetail}`,
      exportText,
      importText,
      symbolText,
      commentText,
      sigText
    ].filter(Boolean).join('\n');
  }
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
  async loadSyncState() {
    try {
      const content = await fs.readFile(STATE_FILE, 'utf8');
      return JSON.parse(content);
    } catch (_) {
      return { lastSync: null, indexed: {} };
    }
  }
  async saveSyncState(state) {
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  }
}

module.exports = { GSDKnowledgeSync };
