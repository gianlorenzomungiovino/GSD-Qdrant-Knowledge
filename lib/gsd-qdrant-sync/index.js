const { readFile, readdir, mkdir, writeFile } = require('fs/promises');
const { watch } = require('fs');
const { join, dirname, extname, basename, relative } = require('path');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { pipeline } = require('@xenova/transformers');
const crypto = require('crypto');

const DEFAULT_VECTOR_NAME = process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2';

const CONFIG = {
  collectionName: process.env.COLLECTION_NAME || 'website-agency-gsd',
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  qdrantApiKey: process.env.QDRANT_API_KEY || null,
  embeddingModel: process.env.LOCAL_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
  mcpEmbeddingModel: process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
  vectorName: DEFAULT_VECTOR_NAME,
  vectorSize: Number(process.env.EMBEDDING_DIMENSIONS || 384),
  batchSize: 100,
  debounceMs: 2000,
  maxContentLength: 5000,
  componentContextGlob: [
    'apps/web/src/components/Header.jsx',
    'apps/web/src/components/PillNav.jsx',
    'apps/web/src/components/Footer.jsx',
    'apps/web/src/components/GridDistortionHero.jsx',
    'apps/web/src/components/Hero.jsx',
    'apps/web/src/components/HomeProjectsScroller.jsx',
    'apps/web/src/components/ProjectCard.jsx',
  ],
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
    try {
      const collection = await this.client.getCollection(CONFIG.collectionName);
      const existingVectors = collection?.config?.params?.vectors;
      const namedVectorExists = existingVectors && !Array.isArray(existingVectors) && existingVectors[CONFIG.vectorName];
      const unnamedVectorExists = existingVectors && !Array.isArray(existingVectors) && existingVectors.size === CONFIG.vectorSize;

      if (unnamedVectorExists && !namedVectorExists) {
        throw new Error(
          `Collection ${CONFIG.collectionName} exists with unnamed vectors. Recreate it with named vector ${CONFIG.vectorName} to match MCP expectations.`
        );
      }
    } catch (err) {
      if (err.status === 404) {
        await this.client.createCollection(CONFIG.collectionName, {
          vectors: {
            [CONFIG.vectorName]: {
              size: CONFIG.vectorSize,
              distance: 'Cosine',
            },
          },
        });
        return;
      }
      throw err;
    }
  }

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
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        fileList.push(fullPath);
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

      if (prevHash === currentHash) return null;

      const body = forcedType === 'code-context' ? content : this.stripFrontmatter(content);
      const type = forcedType || this.inferType(absolutePath);
      const ids = this.extractIds(absolutePath);
      const relativePath = this.toRelativePath(absolutePath);
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
          collection: CONFIG.collectionName,
          embeddingModel: CONFIG.mcpEmbeddingModel,
          vectorName: CONFIG.vectorName,
          ...ids,
          ...extraMetadata,
          syncedAt: new Date().toISOString(),
        },
      };

      this.state.fileHashes[absolutePath] = currentHash;
      return doc;
    } catch (err) {
      if (err.code === 'ENOENT') {
        await this.deleteDocument(absolutePath);
        return null;
      }
      console.error('Error processing ' + absolutePath + ':', err.message);
      return null;
    }
  }

  async collectCodeContextDocs() {
    const docs = [];

    for (const relativePath of CONFIG.componentContextGlob) {
      const absolutePath = join(this.projectRoot, relativePath);
      if (!require('fs').existsSync(absolutePath)) continue;
      const doc = await this.processFile(absolutePath, 'code-context', {
        componentName: basename(absolutePath, extname(absolutePath)),
      });
      if (doc) docs.push(doc);
    }

    return docs;
  }

  async upsertBatch(docs) {
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

    for (let i = 0; i < points.length; i += CONFIG.batchSize) {
      const chunk = points.slice(i, i + CONFIG.batchSize);
      await this.client.upsert(CONFIG.collectionName, { points: chunk });
    }
  }

  async syncAll() {
    await this.ensureCollection();
    const files = await this.walkGsd(this.gsdDir);
    const componentFiles = CONFIG.componentContextGlob.map((file) => join(this.projectRoot, file));
    const currentFiles = new Set([...files.map((file) => this.toAbsolutePath(file)), ...componentFiles]);

    const staleFiles = Object.keys(this.state.fileHashes).filter((file) => !currentFiles.has(file));
    for (const staleFile of staleFiles) {
      await this.deleteDocument(staleFile);
    }

    const docs = [];
    for (const file of files) {
      const doc = await this.processFile(file);
      if (doc) docs.push(doc);
    }

    const componentDocs = await this.collectCodeContextDocs();
    docs.push(...componentDocs);

    if (docs.length > 0) {
      await this.upsertBatch(docs);
    }

    this.state.lastFullSync = new Date().toISOString();
    await this.saveState();
    return docs.length;
  }

  async syncIncremental(filePaths) {
    if (filePaths.length === 0) return 0;

    await this.ensureCollection();

    const docs = [];
    for (const file of filePaths) {
      const doc = await this.processFile(file);
      if (doc) docs.push(doc);
    }

    const shouldRefreshComponents = filePaths.some((file) => file.startsWith(join(this.projectRoot, 'apps', 'web', 'src', 'components')));
    if (shouldRefreshComponents) {
      const componentDocs = await this.collectCodeContextDocs();
      docs.push(...componentDocs);
    }

    if (docs.length > 0) {
      await this.upsertBatch(docs);
    }

    await this.saveState();
    return docs.length;
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
      const isGsdDoc = absolutePath.startsWith(this.gsdDir) && absolutePath.endsWith('.md');
      const isTrackedComponent = CONFIG.componentContextGlob.some((tracked) => absolutePath === join(this.projectRoot, tracked));
      if (!isGsdDoc && !isTrackedComponent) return;
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
