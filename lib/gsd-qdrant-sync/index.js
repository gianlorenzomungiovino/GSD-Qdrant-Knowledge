const { readFile, readdir, mkdir, writeFile, stat } = require('fs/promises');
const { watch } = require('fs');
const { join, dirname, extname, basename, relative, parse } = require('path');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { pipeline } = require('@xenova/transformers');
const crypto = require('crypto');

const DEFAULT_VECTOR_NAME = process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2';

const CONFIG = {
  contextDocsCollection: 'context-docs',
  codeSnippetsCollection: 'code-snippets',
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  qdrantApiKey: process.env.QDRANT_API_KEY || null,
  embeddingModel: process.env.LOCAL_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
  mcpEmbeddingModel: process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
  vectorName: DEFAULT_VECTOR_NAME,
  vectorSize: Number(process.env.EMBEDDING_DIMENSIONS || 384),
  batchSize: 100,
  debounceMs: 2000,
  maxContentLength: 5000,
  // Support all common source file types for comprehensive indexing
  supportedExtensions: {
    '.md': 'context-doc',
    '.js': 'code-snippet',
    '.ts': 'code-snippet',
    '.jsx': 'code-snippet',
    '.tsx': 'code-snippet',
    '.py': 'code-snippet',
    '.go': 'code-snippet',
    '.rs': 'code-snippet',
    '.sql': 'code-snippet',
    '.json': 'code-snippet',
    '.yml': 'code-snippet',
    '.yaml': 'code-snippet',
  },
};

class GSDKnowledgeSync {
  constructor() {
    this.client = null;
    this.embedder = null;
    this.state = { fileHashes: {}, lastFullSync: null };
    this.watcher = null;
    this.debounceTimer = null;
    this.pendingChanges = new Set();
    this.gsdDir = null;
    this.projectRoot = null;
    this.stateFile = null;
    // Logging statistics
    this.stats = {
      totalFiles: 0,
      processedFiles: 0,
      skippedFiles: 0,
      deletedFiles: 0,
      upsertedDocs: 0,
      batchSize: 0,
      totalBatches: 0,
      startTime: null,
      endTime: null,
    };
  }

  async init() {
    this.projectRoot = this.findProjectRoot(process.cwd());
    this.gsdDir = join(this.projectRoot, '.gsd');
    this.stateFile = join(this.gsdDir, '.qdrant-sync-state.json');

    this.client = new QdrantClient({
      url: CONFIG.qdrantUrl,
      apiKey: CONFIG.qdrantApiKey,
    });
    this.embedder = await pipeline('feature-extraction', CONFIG.embeddingModel);
    await this.loadState();
  }

  findProjectRoot(startDir) {
    let currentDir = startDir;
    for (let i = 0; i < 6; i += 1) {
      const candidate = join(currentDir, '.gsd');
      try {
        if (require('fs').existsSync(candidate)) return currentDir;
      } catch (_err) {
        return currentDir;
      }
      const parent = dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
    return startDir;
  }

  async loadState() {
    try {
      const data = await readFile(this.stateFile, 'utf-8');
      this.state = JSON.parse(data);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Failed to load sync state:', err.message);
      this.state = { fileHashes: {}, lastFullSync: null };
    }
  }

  async saveState() {
    await mkdir(dirname(this.stateFile), { recursive: true });
    await writeFile(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  toRelativePath(filePath) {
    return relative(this.projectRoot, filePath).replace(/\\/g, '/');
  }

  toAbsolutePath(filePath) {
    if (!filePath) return null;
    return filePath.startsWith(this.projectRoot) || /^[A-Za-z]:[\\/]/.test(filePath)
      ? filePath
      : join(this.projectRoot, filePath);
  }

  pathToId(filePath) {
    const hash = crypto.createHash('sha256').update(filePath).digest();
    return hash.readUIntBE(0, 6);
  }

  calcHash(content) {
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  }

  async ensureCollection() {
    // Create context-docs collection for .md files in .gsd/
    try {
      await this.client.getCollection(CONFIG.contextDocsCollection);
    } catch (err) {
      if (err.status === 404) {
        await this.client.createCollection(CONFIG.contextDocsCollection, {
          vectors: {
            [CONFIG.vectorName]: {
              size: CONFIG.vectorSize,
              distance: 'Cosine',
            },
          },
        });
        console.log(`Created collection: ${CONFIG.contextDocsCollection}`);
      } else {
        throw err;
      }
    }

    // Create code-snippets collection for all other source files
    try {
      await this.client.getCollection(CONFIG.codeSnippetsCollection);
    } catch (err) {
      if (err.status === 404) {
        await this.client.createCollection(CONFIG.codeSnippetsCollection, {
          vectors: {
            [CONFIG.vectorName]: {
              size: CONFIG.vectorSize,
              distance: 'Cosine',
            },
          },
        });
        console.log(`Created collection: ${CONFIG.codeSnippetsCollection}`);
      } else {
        throw err;
      }
    }
  }

  /**
   * Walk the .gsd directory and collect all files to index
   * Supports multiple file types: .md (context-doc) and other source files (code-snippet)
   */
  async walkGsd(dir, fileList = []) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'milestones' || entry.name === 'slices' || entry.name === 'tasks') {
          await this.walkGsd(fullPath, fileList);
        } else if (dirname(fullPath) === this.gsdDir) {
          if (!['runtime', 'activity', 'worktrees', 'journal'].includes(entry.name)) {
            await this.walkGsd(fullPath, fileList);
          }
        } else {
          await this.walkGsd(fullPath, fileList);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        // Check if extension is in supported extensions list
        if (CONFIG.supportedExtensions[ext]) {
          fileList.push(fullPath);
        }
      }
    }
    return fileList;
  }

  stripFrontmatter(content) {
    const normalized = content.replace(/^\uFEFF/, '');
    if (!normalized.startsWith('---\n')) return normalized;

    const end = normalized.indexOf('\n---\n', 4);
    if (end === -1) return normalized;
    return normalized.slice(end + 5);
  }

  inferType(filePath) {
    const filename = basename(filePath).toUpperCase();
    if (filename.includes('DECISIONS') || filename.includes('DECISION')) return 'decision';
    if (filename.includes('REQUIREMENTS')) return 'requirement';
    if (filename.includes('KNOWLEDGE')) return 'knowledge';
    if (filename.includes('SUMMARY')) return 'summary';
    if (filename.includes('PLAN')) return 'plan';
    if (filename.includes('RESEARCH')) return 'research';
    if (filename.includes('CONTEXT')) return 'context';
    if (filename.includes('UAT')) return 'uat';
    if (filename.includes('VALIDATION')) return 'validation';
    if (filename.includes('PROJECT')) return 'project';
    return 'artifact';
  }

  extractIds(filePath) {
    const relativePath = this.toRelativePath(filePath);
    const parts = relativePath.split('/');
    const result = { milestone: null, slice: null, task: null };

    for (const part of parts) {
      if (!result.milestone && /^M\d+(?:-[a-z0-9]+)?$/i.test(part)) result.milestone = part;
      if (!result.slice && /^S\d+$/i.test(part)) result.slice = part;
      if (!result.task && /^T\d+$/i.test(part)) result.task = part;
    }

    return result;
  }

  inferScope(filePath, ids, type) {
    if (type === 'code-context') return 'component';
    if (ids.task) return 'task';
    if (ids.slice) return 'slice';
    if (ids.milestone) return 'milestone';
    if (filePath.includes(`${require('path').sep}.gsd${require('path').sep}`)) return 'project';
    return 'artifact';
  }

  async generateEmbedding(text) {
    const output = await this.embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  async deleteDocument(filePath) {
    const absolutePath = this.toAbsolutePath(filePath);
    const pointId = this.pathToId(absolutePath);
    await this.client.delete(CONFIG.collectionName, { points: [pointId] });
    delete this.state.fileHashes[absolutePath];
  }

  buildSearchText({ type, ids, relativePath, body, extraLabels = [] }) {
    const labels = [
      `type:${type}`,
      ids.milestone ? `milestone:${ids.milestone}` : null,
      ids.slice ? `slice:${ids.slice}` : null,
      ids.task ? `task:${ids.task}` : null,
      `path:${relativePath}`,
      ...extraLabels,
    ].filter(Boolean);

    return `${labels.join(' ')}\n\n${body.trim()}`.slice(0, CONFIG.maxContentLength);
  }

  summarizeComponent(relativePath, source) {
    const lines = source.split(/\r?\n/);
    const importLines = lines.filter((line) => line.trim().startsWith('import ')).slice(0, 12);
    const functionMatches = [...source.matchAll(/function\s+([A-Z][A-Za-z0-9_]*)|const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\(/g)];
    const exportedNames = functionMatches.map((match) => match[1] || match[2]).filter(Boolean);
    const jsxClassNames = [...source.matchAll(/className="([^"]+)"/g)].map((match) => match[1]).slice(0, 12);
    const routeHints = [...source.matchAll(/(?:to|href)=\"([^\"]+)\"/g)].map((match) => match[1]).slice(0, 12);

    return [
      `Component file: ${relativePath}`,
      exportedNames.length ? `Exported/declared components: ${exportedNames.join(', ')}` : null,
      importLines.length ? `Imports: ${importLines.join(' | ')}` : null,
      jsxClassNames.length ? `Class names: ${jsxClassNames.join(', ')}` : null,
      routeHints.length ? `Route/link hints: ${routeHints.join(', ')}` : null,
      'Source excerpt:',
      source.slice(0, 3200),
    ].filter(Boolean).join('\n');
  }

  async processFile(filePath, forcedType = null, extraMetadata = {}) {
    const absolutePath = this.toAbsolutePath(filePath);

    try {
      const content = await readFile(absolutePath, 'utf-8');
      const currentHash = this.calcHash(content);
      const prevHash = this.state.fileHashes[absolutePath];

      if (prevHash === currentHash) {
        this.stats.skippedFiles++;
        return null;
      }

      // Determine type from extension if not forced
      const ext = extname(absolutePath).toLowerCase();
      const type = forcedType || CONFIG.supportedExtensions[ext] || this.inferType(absolutePath);
      const body = forcedType === 'code-context' ? content : this.stripFrontmatter(content);
      const ids = this.extractIds(absolutePath);
      const relativePath = this.toRelativePath(absolutePath);
      
      // Extract metadata from related .md files for code files
      let additionalMetadata = {};
      if (ext !== '.md' && type === 'code-snippet') {
        const relatedContext = await this.findRelatedContextFiles(absolutePath);
        if (relatedContext.length > 0) {
          additionalMetadata.relatedContextIds = [];
          additionalMetadata.relatedContextFiles = relatedContext.map(f => f.name);
          relatedContext.forEach(ctx => {
            additionalMetadata.relatedContextIds.push(...ctx.ids);
          });
          additionalMetadata.relatedContextIds = [...new Set(additionalMetadata.relatedContextIds)];
        }
      }
      
      const searchText = forcedType === 'code-context'
        ? this.buildSearchText({
            type,
            ids,
            relativePath,
            body: this.summarizeComponent(relativePath, body),
            extraLabels: [extraMetadata.componentName ? `component:${extraMetadata.componentName}` : null],
          })
        : this.buildSearchText({ type, ids, relativePath, body });

      const doc = {
        id: this.pathToId(absolutePath),
        content: searchText,
        metadata: {
          type,
          scope: this.inferScope(absolutePath, ids, type),
          path: relativePath,
          project: basename(this.projectRoot),
          collection: ext === '.md' && filePath.includes(`${require('path').sep}.gsd${require('path').sep}`) ? CONFIG.contextDocsCollection : CONFIG.codeSnippetsCollection,
          embeddingModel: CONFIG.mcpEmbeddingModel,
          vectorName: CONFIG.vectorName,
          syncedAt: new Date().toISOString(),
          ...ids,
          ...extraMetadata,
          ...additionalMetadata,
        },
      };

      this.state.fileHashes[absolutePath] = currentHash;
      this.stats.processedFiles++;
      return doc;
    } catch (err) {
      if (err.code === 'ENOENT') {
        await this.deleteDocument(absolutePath);
        this.stats.deletedFiles++;
        return null;
      }
      console.error('❌ Error processing ' + absolutePath + ':', err.message);
      return null;
    }
  }

  async upsertBatch(docs, collection = null) {
    const points = await Promise.all(
      docs.map(async (doc) => {
        const vector = await this.generateEmbedding(doc.content);
        return {
          id: doc.id,
          vector: {
            [CONFIG.vectorName]: vector,
          },
          payload: {
            ...doc.metadata,
            content: doc.content,
            document: doc.content,
          },
        };
      })
    );

    const targetCollection = collection || (points.length > 0 && points[0]?.payload?.collection) || CONFIG.codeSnippetsCollection;

    // Process in configurable batch sizes with detailed logging
    for (let i = 0; i < points.length; i += CONFIG.batchSize) {
      const chunk = points.slice(i, i + CONFIG.batchSize);
      const batchNum = Math.floor(i / CONFIG.batchSize) + 1;
      const totalBatches = Math.ceil(points.length / CONFIG.batchSize);
      
      console.log(`   📦 Batch ${batchNum}/${totalBatches}: Upserting ${chunk.length} points to ${targetCollection}...`);
      await this.client.upsert(targetCollection, { points: chunk });
      this.stats.totalBatches++;
      this.stats.batchSize = chunk.length;
    }
  }

  async syncAll() {
    this.stats.startTime = Date.now();
    this.stats.totalBatches = 0;
    
    console.log('📊 Starting full sync...');
    
    await this.ensureCollection();
    const files = await this.walkGsd(this.gsdDir);
    this.stats.totalFiles = files.length;

    console.log(`📁 Found ${files.length} files to process`);

    // Handle stale files first
    const staleFiles = Object.keys(this.state.fileHashes).filter((file) => !files.some((f) => this.toAbsolutePath(f) === file));
    if (staleFiles.length > 0) {
      console.log(`🗑️  Found ${staleFiles.length} stale files to delete`);
      for (const staleFile of staleFiles) {
        await this.deleteDocument(staleFile);
        this.stats.deletedFiles++;
      }
    }

    const contextDocs = [];
    const codeDocs = [];

    console.log('🔄 Processing files...');
    for (const file of files) {
      const doc = await this.processFile(file);
      if (doc) {
        if (doc.metadata.collection === CONFIG.contextDocsCollection) {
          contextDocs.push(doc);
        } else {
          codeDocs.push(doc);
        }
      }
    }

    // Upsert in batches with progress logging
    if (contextDocs.length > 0) {
      console.log(`📦 Upserting ${contextDocs.length} context docs in batches...`);
      await this.upsertBatch(contextDocs, CONFIG.contextDocsCollection);
      this.stats.upsertedDocs += contextDocs.length;
    }
    if (codeDocs.length > 0) {
      console.log(`📦 Upserting ${codeDocs.length} code snippets in batches...`);
      await this.upsertBatch(codeDocs, CONFIG.codeSnippetsCollection);
      this.stats.upsertedDocs += codeDocs.length;
    }

    this.state.lastFullSync = new Date().toISOString();
    await this.saveState();
    
    this.stats.endTime = Date.now();
    const duration = ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(2);
    
    console.log('✅ Full sync completed!');
    console.log(`   Total files: ${this.stats.totalFiles}`);
    console.log(`   Processed: ${this.stats.processedFiles}`);
    console.log(`   Skipped (unchanged): ${this.stats.skippedFiles}`);
    console.log(`   Deleted: ${this.stats.deletedFiles}`);
    console.log(`   Upserted: ${this.stats.upsertedDocs}`);
    console.log(`   Batches: ${this.stats.totalBatches}`);
    console.log(`   Duration: ${duration}s`);
    
    return contextDocs.length + codeDocs.length;
  }

  async syncIncremental(filePaths) {
    if (filePaths.length === 0) return 0;

    this.stats.startTime = Date.now();
    this.stats.totalBatches = 0;
    
    console.log('📊 Starting incremental sync...');
    console.log(`📁 Processing ${filePaths.length} changed files`);

    await this.ensureCollection();

    const contextDocs = [];
    const codeDocs = [];

    console.log('🔄 Processing files...');
    for (const file of filePaths) {
      const doc = await this.processFile(file);
      if (doc) {
        if (doc.metadata.collection === CONFIG.contextDocsCollection) {
          contextDocs.push(doc);
        } else {
          codeDocs.push(doc);
        }
      }
    }

    // Upsert in batches with progress logging
    if (contextDocs.length > 0) {
      console.log(`📦 Upserting ${contextDocs.length} context docs in batches...`);
      await this.upsertBatch(contextDocs, CONFIG.contextDocsCollection);
      this.stats.upsertedDocs += contextDocs.length;
    }
    if (codeDocs.length > 0) {
      console.log(`📦 Upserting ${codeDocs.length} code snippets in batches...`);
      await this.upsertBatch(codeDocs, CONFIG.codeSnippetsCollection);
      this.stats.upsertedDocs += codeDocs.length;
    }

    await this.saveState();
    
    this.stats.endTime = Date.now();
    const duration = ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(2);
    
    console.log('✅ Incremental sync completed!');
    console.log(`   Processed: ${this.stats.processedFiles}`);
    console.log(`   Skipped (unchanged): ${this.stats.skippedFiles}`);
    console.log(`   Upserted: ${this.stats.upsertedDocs}`);
    console.log(`   Batches: ${this.stats.totalBatches}`);
    console.log(`   Duration: ${duration}s`);
    
    return contextDocs.length + codeDocs.length;
  }

  async onFileChange(filePath) {
    this.pendingChanges.add(this.toAbsolutePath(filePath));
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      const changes = Array.from(this.pendingChanges);
      this.pendingChanges.clear();
      try {
        await this.syncIncremental(changes);
      } catch (err) {
        console.error('Incremental sync failed:', err.message);
      }
    }, CONFIG.debounceMs);
  }

  startWatcher() {
    if (this.watcher) return;

    this.watcher = watch(this.projectRoot, { recursive: true }, (eventType, filePath) => {
      if (!filePath) return;
      const absolutePath = this.toAbsolutePath(filePath);
      // Monitor all supported file types in .gsd directory
      const isGsdDoc = absolutePath.startsWith(this.gsdDir);
      const ext = extname(absolutePath).toLowerCase();
      const isSupportedType = CONFIG.supportedExtensions[ext];
      
      if (!isGsdDoc || !isSupportedType) return;
      if (eventType === 'change' || eventType === 'rename') {
        this.onFileChange(absolutePath);
      }
    });

    this.syncAll().catch((err) => {
      console.error('Initial sync failed:', err.message);
    });

    process.on('SIGINT', () => this.stopWatcher());
    process.on('SIGTERM', () => this.stopWatcher());
  }

  stopWatcher() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Get sync statistics
   */
  getStats() {
    return {
      ...this.stats,
      lastFullSync: this.state.lastFullSync,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalFiles: 0,
      processedFiles: 0,
      skippedFiles: 0,
      deletedFiles: 0,
      upsertedDocs: 0,
      batchSize: 0,
      totalBatches: 0,
      startTime: null,
      endTime: null,
    };
  }

  /**
   * Extract GSD IDs from content (R001, D005, etc.)
   */
  extractGsdIds(content) {
    const ids = [];
    // Match patterns like R001, D005, M001, S01, T01
    const pattern = /\b([RSDMT]\d+(?:-[a-z0-9]+)?)\b/gi;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      ids.push(match[1].toUpperCase());
    }
    return [...new Set(ids)]; // Remove duplicates
  }

  /**
   * Find relevant .md files in .gsd/ that reference a given file
   */
  async findRelatedContextFiles(filePath) {
    const relatedFiles = [];
    
    // Look for .md files in .gsd/ root level (DECISIONS.md, REQUIREMENTS.md, KNOWLEDGE.md, etc.)
    try {
      const gsdFiles = await readdir(this.gsdDir, { withFileTypes: true });
      for (const entry of gsdFiles) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const fullPath = join(this.gsdDir, entry.name);
          try {
            const content = await readFile(fullPath, 'utf-8');
            // Check if this file references the given filePath or contains relevant IDs
            const relativePath = this.toRelativePath(filePath);
            
            // Look for path references, component names, or IDs mentioned in the file
            const hasPathReference = content.toLowerCase().includes(relativePath.toLowerCase()) ||
                                    content.includes(filePath) ||
                                    content.includes(parse(filePath).name);
            
            // Also check for GSD IDs that might be related
            const gsdIds = this.extractGsdIds(content);
            
            if (hasPathReference || gsdIds.length > 0) {
              relatedFiles.push({
                path: fullPath,
                name: entry.name,
                content: content.slice(0, 2000), // Limit content size
                ids: gsdIds
              });
            }
          } catch (err) {
            // Skip files that can't be read
          }
        }
      }
    } catch (err) {
      // .gsd directory doesn't exist or can't be read
    }
    
    return relatedFiles;
  }

  /**
   * Get context for a snippet from .md files
   */
  async getContextForSnippet(snippetMetadata, searchQuery = '') {
    const contextItems = [];
    
    // If we have a path, find related context files
    if (snippetMetadata.path) {
      const relatedFiles = await this.findRelatedContextFiles(
        join(this.projectRoot, snippetMetadata.path)
      );
      
      for (const file of relatedFiles) {
        contextItems.push({
          source: file.name,
          path: this.toRelativePath(file.path),
          ids: file.ids,
          excerpt: this.extractRelevantExcerpt(file.content, searchQuery || snippetMetadata.type),
          type: 'context-document'
        });
      }
    }
    
    // Also look for requirement and decision documents that might be relevant
    try {
      const mdFiles = ['REQUIREMENTS.md', 'DECISIONS.md', 'KNOWLEDGE.md', 'PROJECT.md', 'README.md'];
      for (const fileName of mdFiles) {
        const filePath = join(this.gsdDir, fileName);
        try {
          const stat = await stat(filePath);
          if (stat.isFile()) {
            const content = await readFile(filePath, 'utf-8');
            const gsdIds = this.extractGsdIds(content);
            
            // Check if query or snippet type is mentioned
            const relevanceScore = this.calculateRelevanceScore(content, searchQuery || snippetMetadata.type);
            
            if (relevanceScore > 0.3) {
              contextItems.push({
                source: fileName,
                path: this.toRelativePath(filePath),
                ids: gsdIds,
                excerpt: this.extractRelevantExcerpt(content, searchQuery || snippetMetadata.type),
                type: 'context-document',
                relevanceScore
              });
            }
          }
        } catch (err) {
          // File doesn't exist, skip
        }
      }
    } catch (err) {
      // .gsd directory issue
    }
    
    return contextItems;
  }

  /**
   * Calculate relevance score between content and query
   */
  calculateRelevanceScore(content, query) {
    if (!query) return 0;
    
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return 0;
    
    const contentLower = content.toLowerCase();
    let matches = 0;
    
    for (const word of queryWords) {
      if (contentLower.includes(word)) matches++;
    }
    
    return matches / queryWords.length;
  }

  /**
   * Extract relevant excerpt from content
   */
  extractRelevantExcerpt(content, query) {
    if (!query) return content.slice(0, 500);
    
    // Try to find the query in the content and extract surrounding context
    const queryIndex = content.toLowerCase().indexOf(query.toLowerCase());
    if (queryIndex > -1) {
      const start = Math.max(0, queryIndex - 100);
      const end = Math.min(content.length, queryIndex + query.length + 200);
      const excerpt = content.slice(start, end);
      return (start > 0 ? '... ' : '') + excerpt + (end < content.length ? ' ...' : '');
    }
    
    // Fallback: return first 500 chars
    return content.slice(0, 500);
  }

   /**
   * Search Qdrant and enrich results with context
   */
  async searchWithContext(query, options = {}) {
    const { collection = CONFIG.codeSnippetsCollection, limit = 10, withContext = false } = options;
    
    // Generate embedding for the query
    let queryVector;
    try {
      const embeddingResult = await this.generateEmbedding(query);
      queryVector = Array.isArray(embeddingResult) ? embeddingResult : embeddingResult.data;
    } catch (err) {
      console.error('Failed to generate embedding:', err.message);
      // Fall back to local database
      return [];
    }
    
    // Search in the specified collection using the correct Qdrant API
    let searchResults;
    try {
      searchResults = await this.client.search(collection, {
        vector: {
          vector: queryVector,
          name: CONFIG.vectorName,
        },
        limit,
        with_payload: true,
      });
    } catch (err) {
      console.error('Qdrant search failed:', err.message);
      return [];
    }
    
    const results = searchResults.map(point => ({
      id: point.id,
      score: point.score,
      payload: point.payload,
      content: point.payload?.content || point.payload?.document || '',
      path: point.payload?.path,
      type: point.payload?.type,
      scope: point.payload?.scope,
      milestone: point.payload?.milestone,
      slice: point.payload?.slice,
      task: point.payload?.task,
    }));
    
    // Enrich with context if requested
    if (withContext) {
      for (const result of results) {
        result.context = await this.getContextForSnippet(
          { path: result.path, type: result.type },
          query
        );
      }
    }
    
    return results;
  }
}

async function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0] || 'sync';

  const sync = new GSDKnowledgeSync();
  await sync.init();

  if (command === 'sync') {
    const count = await sync.syncAll();
    console.log('Synced ' + count + ' documents.');
  } else if (command === 'watch') {
    console.log('Watching for changes...');
    sync.startWatcher();
  } else {
    console.error('Usage: sync|watch');
    process.exit(1);
  }
}

module.exports = { GSDKnowledgeSync, CONFIG };
if (require.main === module) {
  runCLI().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
