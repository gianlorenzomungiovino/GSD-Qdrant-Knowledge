#!/usr/bin/env node

const { QdrantClient } = require('@qdrant/js-client-rest');
const { promises: fs, existsSync } = require('fs');
const { join, basename, extname, relative, dirname } = require('path');
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
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf', '.zip', '.gz', '.tar', '.mp3', '.mp4', '.mov', '.woff', '.woff2', '.ttf', '.env', '.lock', '.log',
  // YAML lockfiles have no semantic value for cross-project retrieval
  '.yaml', '.yml'
]);

// GSD files with genuine cross-project value — only these are indexed from .gsd/
// Everything else (task plans, summaries, slice details) is project-specific noise.
const CROSS_PROJECT_GSD_FILES = new Set([
  'ROADMAP.md',       // Architecture vision, slice dependencies, demo milestones
  'CONTEXT.md',       // Milestone brief — scope, goals, constraints from discussion
  'UAT.md',           // Verified test cases — reusable patterns and edge cases
  'ASSESSMENT.md',    // Roadmap reassessment — strategic decisions after slice completion
  'RESEARCH.md',      // Research findings — library comparisons, architecture analysis
  'CONTEXT-DRAFT.md'  // Draft context — incremental planning artifacts
]);

// Files managed by GSD locally - exclude from Qdrant to avoid duplicate context
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
    this.vectorName = process.env.VECTOR_NAME || 'codebert-768';
    this.embeddingDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10);
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'Xenova/codebert-base';
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

  indexedFileKey(type, relPath) {
    // Use a delimiter that cannot appear in filesystem paths (ASCII 0x01)
    // This avoids ambiguity when paths contain underscores (e.g. src/gsd_qdrant_mcp/index.js)
    return `indexed_${type}\x01${relPath}`;
  }

  async syncToGsdMemory() {
    console.log('📦 Syncing to unified gsd_memory collection...');
    const gsdDir = join(PROJECT_ROOT, '.gsd');
    const hasGsdDir = existsSync(gsdDir);

    if (!hasGsdDir) {
      console.log('  ℹ️  .gsd directory not found - indexing code only');
    }

    // Check if collection exists and has points. If empty, force full re-index.
    let collectionEmpty = false;
    try {
      const countResult = await this.client.count(this.collectionName);
      const total = countResult.count ?? countResult.total ?? 0;
      if (total === 0) {
        console.log('  ⚠️  Collection is empty — forcing full re-index');
        collectionEmpty = true;
      }
    } catch (_) {
      // Collection doesn't exist yet — will be created in init()
      collectionEmpty = true;
    }

    const mdFiles = hasGsdDir ? await this.walkGsd(gsdDir) : [];
    const codeFiles = await this.walkProjectCode(PROJECT_ROOT);
    
    console.log(`📄 Found ${mdFiles.length} documentation files to index`);
    console.log(`💻 Found ${codeFiles.length} code files to index`);
    
    // First, build the document reference index (for finding related docs)
    const docIndex = hasGsdDir ? await this.buildDocReferenceIndex(gsdDir) : [];
    
    const seenIds = new Set();
    let updated = 0;
    
    // If collection is empty, reset sync state to force re-indexing all files
    const syncState = collectionEmpty ? {} : await this.loadSyncState();
    
    // Index documentation files (.md) — one point per file (docs are small enough)
    for (const filePath of mdFiles) {
      const content = await fs.readFile(filePath, 'utf8');
      const relPath = this.toProjectRelative(filePath);
      const id = this.makePointId('doc', relPath);
      const hash = this.hashContent(content);
      seenIds.add(relPath);
      
      // Check if already indexed
      if (syncState[this.indexedFileKey('doc', relPath)]?.hash === hash) continue;
      
      const payload = await this.buildDocPayload(filePath, content, relPath, content);
      const vector = await this.embedText(this.buildDocText(relPath, content, payload));
      
      await this.client.upsert(this.collectionName, { points: [{ id, vector: { [this.vectorName]: vector }, payload }] });
      syncState[this.indexedFileKey('doc', relPath)] = { path: relPath, type: 'doc', hash };
      updated += 1;
    }
    
    // Index code files — chunk into multiple points per file for better semantic granularity.
    // Each chunk gets its own Qdrant point with parentId linking back to the source file.
    const CHUNK_MAX_CHARS = parseInt(process.env.QDRANT_CHUNK_MAX || '1500', 10);
    const CHUNK_OVERLAP_CHARS = parseInt(process.env.QDRANT_CHUNK_OVERLAP || '200', 10);

    for (const filePath of codeFiles) {
      const content = await fs.readFile(filePath, 'utf8');
      const relPath = this.toProjectRelative(filePath);
      const fileHash = this.hashContent(content);
      seenIds.add(relPath);
      
      // Check if already indexed — skip entire file if hash unchanged
      if (syncState[this.indexedFileKey('code', relPath)]?.hash === fileHash) continue;

      // Delete old chunks for this file before re-indexing with new content
      const parentId = this.makePointId('code', relPath);
      await this.deleteOldChunks(parentId, relPath);

      // Chunk the file and index each chunk as a separate point.
      // Qdrant requires integer or UUID IDs — we derive numeric chunk IDs by hashing
      // (parentId, chunkIndex) to ensure uniqueness while keeping traceability.
      const chunks = this.chunkFileContent(content, CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = this.makeChunkPointId(parentId, i);
        
        // Build embedding text from the chunk content + file-level metadata
        const chunkPayload = await this.buildChunkedCodePayload(
          filePath, content, relPath, docIndex, i, chunks.length, chunks[i]
        );
        const vector = await this.embedText(this.buildChunkedCodeText(relPath, content, chunkPayload));

        await this.client.upsert(this.collectionName, { points: [{ id: chunkId, vector: { [this.vectorName]: vector }, payload: chunkPayload }] });
      }
      
      syncState[this.indexedFileKey('code', relPath)] = { path: relPath, type: 'code', hash: fileHash };
      updated += 1; // Count as one "file" updated (even though it creates multiple points)
    }
    
    let deleted = await this.deleteMissingPoints(seenIds, syncState);
    
    // Second pass: scan all points in the collection for this project and delete any
    // that no longer have a corresponding file on disk. This catches orphans whose
    // syncState entry was lost (corrupted state, manual file deletion, etc.).
    const staleOrphans = await this.deleteStaleProjectPoints(seenIds);
    deleted += staleOrphans;
    
    syncState.lastSync = new Date().toISOString();
    await this.saveSyncState(syncState);
    
    console.log(`  ✅ Updated ${updated}, deleted ${deleted}`);
    return { total: mdFiles.length + codeFiles.length, updated, deleted };
  }

  async searchWithContext(query, options = {}) {
    const limit = options.limit || 10;
    const vector = await this.embedText(query);

    // Prefetch-based search: broad candidate gathering then refine with score threshold
    const t0 = Date.now();
    const prefetchLimit = Math.max(limit * 3, 20);
    const SCORE_THRESHOLD = options.scoreThreshold || 0.6;

    let hits = [];
    try {
      hits = await this.client.search(this.collectionName, { 
        vector: { name: this.vectorName, vector },
        prefetch: {
          query: { name: this.vectorName, vector },
          limit: prefetchLimit,
        },
        limit: Math.min(limit * 2, prefetchLimit),
        score_threshold: SCORE_THRESHOLD,
        with_payload: true, 
        with_vector: false
      });
    } catch (prefetchErr) {
      // Fallback: plain search if prefetch fails (e.g. version incompatibility)
      if (process.env.GSD_QDRANT_VERBOSE === '1') {
        console.warn('[qdrant] prefetch not supported, falling back to search');
      }
      hits = await this.client.search(this.collectionName, { 
        vector: { name: this.vectorName, vector }, 
        limit,
        with_payload: true, 
        with_vector: false
      });
    }

    const elapsed = Date.now() - t0;
    if (process.env.GSD_QDRANT_VERBOSE === '1') {
      console.log('[qdrant] searchWithContext: %d results in %dms', hits.length, elapsed);
    }

    // Filter results locally
    let filtered = hits;
    if (options.type) {
      filtered = filtered.filter(h => h.payload.type === options.type);
    }
    
    return filtered.map((hit) => ({ score: hit.score, ...hit.payload }));
  }

  /**
   * Delete ALL points belonging to this project from the collection.
   * Uses server-side filter so only points with matching project_id are ever fetched.
   * Called during uninstall to clean up Qdrant before removing local artifacts.
   */
  async deleteAllProjectPoints() {
    let deleted = 0;
    const BATCH_SIZE = 100;

    let hasMore = true;
    while (hasMore) {
      const scrollResult = await this.client.scroll(this.collectionName, {
        limit: BATCH_SIZE,
        with_payload: false,
        with_vector: false,
        filter: {
          must: [
            { key: 'project_id', match: { value: this.projectName } }
          ]
        }
      });

      if (scrollResult.points.length === 0) {
        hasMore = false;
        break;
      }

      const pointIds = scrollResult.points.map(p => p.id);
      await this.client.delete(this.collectionName, { points: pointIds });
      deleted += pointIds.length;

      if (scrollResult.points.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    return deleted;
  }

  startWatcher() { console.log('👀 Watch mode not implemented yet. Run `gsd-qdrant-knowledge` or `node src/sync-knowledge.js`.'); }

  /**
   * Walk .gsd/ directory and return only files with genuine cross-project value.
   * Uses a whitelist approach: only index ROADMAP, CONTEXT, UAT, ASSESSMENT, RESEARCH,
   * and CONTEXT-DRAFT files. Everything else (task plans, summaries, slice details) is
   * project-specific noise that has no reuse value across projects.
   */
  async walkGsd(dir) {
    const files = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.walkGsd(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Whitelist: only index GSD files that have cross-project value
        const fileName = basename(entry.name, '.md').toUpperCase();
        // Match ROADMAP, CONTEXT, UAT, ASSESSMENT, RESEARCH, CONTEXT-DRAFT (and their numbered variants like S01-UAT)
        if (CROSS_PROJECT_GSD_FILES.has(basename(fullPath))) {
          files.push(fullPath);
        } else if (/^(ROADMAP|CONTEXT|UAT|ASSESSMENT|RESEARCH)$/.test(fileName)) {
          // Allow numbered variants: M001-ROADMAP, S03-UAT, T02-RESEARCH, etc.
          const baseName = fileName.replace(/^[A-Z]+\d+[-_]/i, '');
          if (CROSS_PROJECT_GSD_FILES.has(`${baseName}.md`)) {
            files.push(fullPath);
          } else if (/^(ROADMAP|CONTEXT|UAT|ASSESSMENT|RESEARCH)$/.test(baseName) || baseName === 'CONTEXT-DRAFT') {
            files.push(fullPath);
          }
        }
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
  async upsertPoint(collection, point) { await this.client.upsert(collection, { points: [point] }); }
  async deleteMissingPoints(seenIds, syncState) {
    // Collect entries to delete — use stored path and type directly instead of
    // reverse-engineering from the key (which was ambiguous with underscore-encoded paths)
    const candidates = [];
    
    for (const [key, entry] of Object.entries(syncState)) {
      // Skip reserved keys
      if (key === 'lastSync') continue;
      if (!key.startsWith('indexed_')) continue;
      
      // Skip malformed entries (legacy format without type)
      const relPath = entry.path;
      const type = entry.type;
      if (!relPath || !type) {
        // Legacy entry — try to repair by removing it (orphaned data)
        delete syncState[key];
        continue;
      }
      
      if (!seenIds.has(relPath)) {
        candidates.push({ key, relPath, type });
      }
    }
    
    if (candidates.length === 0) return 0;
    
    // Before deleting, verify these points actually belong to this project.
    // This prevents cross-project collisions when two projects share the same
    // file path (e.g., both have src/cli.js) but different content.
    const candidateIds = new Set(candidates.map(({ relPath, type }) => 
      this.makePointId(type, relPath)
    ));
    
    // Scroll points for this project only and find which candidates actually exist
    let pointsToDelete = [];
    let hasMore = true;
    while (hasMore) {
      const scrollResult = await this.client.scroll(this.collectionName, {
        limit: 200,
        with_payload: ['project_id', 'source', 'type'],
        with_vector: false,
        filter: {
          must: [
            { key: 'project_id', match: { value: this.projectName } }
          ]
        }
      });
      
      for (const point of scrollResult.points) {
        if (!candidateIds.has(point.id)) continue;
        // Verify project_id matches as a safety net
        if (point.payload?.project_id !== this.projectName) continue;
        pointsToDelete.push(point.id);
      }
      
      if (scrollResult.points.length < 200) hasMore = false;
    }
    
    if (pointsToDelete.length > 0) {
      await this.client.delete(this.collectionName, { points: pointsToDelete });
      console.log(`  🗑️  Deleted ${pointsToDelete.length} orphaned point(s) from project '${this.projectName}'`);
    }
    
    // Always clean up syncState for candidates we attempted to delete
    for (const { key } of candidates) delete syncState[key];
    
    return pointsToDelete.length;
  }

  /**
   * Second-pass orphan cleanup: scan points belonging to THIS project only and delete any
   * that no longer have a corresponding file on disk.
   * Filters by project_id so other projects' points are never touched.
   */
  async deleteStaleProjectPoints(seenIds) {
    let deleted = 0;
    const BATCH_SIZE = 50;
    
    // Scroll only points belonging to this project via Qdrant filter
    let hasMore = true;
    while (hasMore) {
      const scrollResult = await this.client.scroll(this.collectionName, {
        limit: BATCH_SIZE,
        with_payload: ['project_id', 'source', 'type'],
        with_vector: false,
        filter: {
          must: [
            {
              key: 'project_id',
              match: { value: this.projectName }
            }
          ]
        }
      });
      
      if (scrollResult.points.length === 0) {
        hasMore = false;
        break;
      }
      
      const pointsToDelete = [];
      for (const point of scrollResult.points) {
        // Double-check project_id as a safety net
        if (point.payload?.project_id !== this.projectName) continue;
        
        const relPath = point.payload?.source;
        const type = point.payload?.type;
        if (!relPath || !type) continue;
        
        // If the file is still on disk, skip it
        if (seenIds.has(relPath)) continue;
        
        pointsToDelete.push(point.id);
      }
      
      if (pointsToDelete.length > 0) {
        await this.client.delete(this.collectionName, { points: pointsToDelete });
        deleted += pointsToDelete.length;
        console.log(`  🗑️  Deleted ${pointsToDelete.length} stale point(s) from project '${this.projectName}'`);
      }
      
      if (scrollResult.points.length < BATCH_SIZE) {
        hasMore = false;
      }
    }
    
    return deleted;
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
      title: metadata.title || basename(filePath),
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
    // Weighted code text: structural elements (signatures/exports/imports) prepended
    // so CodeBERT gives them more attention — early tokens receive higher positional weight.
    const MAX_WEIGHTED_HEADER = 2000;   // chars for signatures + exports + imports
    const MAX_BODY = 4000;              // chars reserved for main content
    
    // --- Weighted header: structural elements first ---
    const sigText = payload.signatures?.join(' | ') || '';
    const exportText = payload.exports?.length ? `EXPORTS:${payload.exports.join(', ')}` : '';
    const importText = payload.imports?.length ? `IMPORTS:${payload.imports.join(', ')}` : '';
    
    let headerParts = [sigText, exportText, importText].filter(Boolean);
    
    // Only build header if there are structural elements to weight
    let header = '';
    if (headerParts.length > 0) {
      header = 'SIGNATURES:' +
        (sigText ? `\nsignatures: ${sigText}` : '') +
        (exportText ? `\nexports: ${exportText.replace('EXPORTS:', '')}` : '') +
        (importText ? `\nimports: ${importText.replace('IMPORTS:', '')}` : '');
      
      // Truncate header to budget
      if (header.length > MAX_WEIGHTED_HEADER) {
        header = header.slice(0, MAX_WEIGHTED_HEADER);
      }
    }
    
    // --- Body: metadata + content summary ---
    const bodyParts = [
      `project:${this.projectName}`,
      `path:${relPath}`,
      `language:${payload.language}`,
      `kind:${payload.kindDetail}`,
      payload.symbolNames?.length ? `symbols:${payload.symbolNames.join(', ')}` : null,
      payload.comments?.length ? `comments:${payload.comments.slice(0, 10).join(' | ')}` : null,
    ].filter(Boolean);
    
    // Truncate body to budget
    let body = bodyParts.join('\n');
    if (body.length > MAX_BODY) {
      body = body.slice(0, MAX_BODY);
    }
    
    return header + '\n' + body;
  }

  /**
   * Split file content into overlapping chunks for better semantic granularity.
   * 
   * Strategy: try to split at logical boundaries (function/class declarations) first.
   * If no good boundary is found within range, hard-cut at maxChars.
   * Overlap preserves context between adjacent chunks (e.g., a function calling another).
   */
  chunkFileContent(content, maxChars = 1500, overlapChars = 200) {
    const chunks = [];

    // Small files: no need to split
    if (content.length <= maxChars) {
      return [{ content, startLine: 1, endLine: this.countLines(content), fullContent: true }];
    }

    // Find logical boundaries — positions where functions/classes/methods begin.
    // We look for lines that start with function/class/const=arrow/export patterns.
    const boundaryPositions = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Match: export async function, class Name, const name = (... =>, method(
      if (/^(export\s+)?(?:async\s+)?function\b/.test(line) ||
          /^class\b[A-Za-z_$]/.test(line) ||
          /^(const|let|var)\s+[A-Za-z_]\w*\s*=\s*(?:async\s+)?\(/.test(line)) {
        boundaryPositions.push({ lineIndex: i, charPos: this.charPositionAtLine(lines, i), text: line });
      }
    }

    // Build chunks by splitting at boundaries when possible
    let pos = 0;       // current character position in content
    let chunkIdx = 0;
    
    while (pos < content.length) {
      const remaining = content.slice(pos);
      
      if (remaining.length <= maxChars) {
        // Last chunk — take everything left
        chunks.push({ 
          content: remaining, 
          startLine: this.lineNumberAtChar(content, pos),
          endLine: this.countLines(remaining),
          fullContent: false 
        });
        break;
      }

      // Try to find a good boundary within the next maxChars range.
      // Look for boundaries between 50% and 90% of current chunk size to avoid tiny chunks.
      const searchStart = Math.floor(pos + maxChars * 0.4);
      const searchEnd = Math.min(pos + Math.floor(maxChars * 0.85), content.length - overlapChars);

      let bestBoundaryIdx = null;
      let bestBoundaryDist = Infinity;
      
      for (const bp of boundaryPositions) {
        if (bp.charPos < searchStart || bp.charPos > searchEnd) continue;
        
        // Prefer boundaries that are close to the middle of our range
        const midPoint = Math.floor((searchStart + searchEnd) / 2);
        const distFromMid = Math.abs(bp.charPos - midPoint);
        
        if (distFromMid < bestBoundaryDist) {
          bestBoundaryIdx = bp;
          bestBoundaryDist = distFromMid;
        }
      }

      let splitAt;
      
      if (bestBoundaryIdx !== null && bestBoundaryDist <= maxChars * 0.35) {
        // Use the boundary — but include a few lines before it for context
        const ctxLinesBefore = Math.min(2, bestBoundaryIdx.lineIndex);
        splitAt = this.charPositionAtLine(lines, bestBoundaryIdx.lineIndex - ctxLinesBefore);
      } else if (bestBoundaryIdx !== null) {
        // Boundary found but too far — use it anyway rather than hard-cutting mid-function
        const ctxLinesBefore = Math.min(2, bestBoundaryIdx.lineIndex);
        splitAt = this.charPositionAtLine(lines, bestBoundaryIdx.lineIndex - ctxLinesBefore);
      } else {
        // No boundary found in range — hard cut at maxChars * 0.85 to leave room for overlap
        splitAt = pos + Math.floor(maxChars * 0.85);
        
        // Try to break at a newline near the cut point (prefer line boundaries)
        const afterCut = content.slice(splitAt, splitAt + 100);
        const newLineIdx = afterCut.indexOf('\n');
        if (newLineIdx > 0 && newLineIdx < 50) {
          splitAt += newLineIdx; // Move cut to end of current line
        } else {
          // Find previous newline going backwards from the hard-cut point
          const prevNewline = content.lastIndexOf('\n', splitAt - 1);
          if (prevNewline > pos + maxChars * 0.5) {
            splitAt = prevNewline; // Cut at end of line instead of mid-line
          }
        }
      }

      const chunkContent = content.slice(pos, splitAt).trimEnd();
      
      chunks.push({ 
        content: chunkContent, 
        startLine: this.lineNumberAtChar(content, pos),
        endLine: this.lineNumberAtChar(content, Math.min(splitAt - 1, content.length)),
        fullContent: false 
      });

      // Move to next position with overlap
      const overlapStart = splitAt - overlapChars;
      pos = Math.max(overlapStart, splitAt); // Ensure forward progress even if overlap is large
    }

    return chunks;
  }

  /** Get character position at the start of a given line index */
  charPositionAtLine(lines, lineIndex) {
    let pos = 0;
    for (let i = 0; i < Math.min(lineIndex, lines.length - 1); i++) {
      pos += lines[i].length + 1; // +1 for newline character
    }
    return pos;
  }

  /** Get line number (1-based) at a given character position */
  lineNumberAtChar(content, charPos) {
    let line = 1;
    for (let i = 0; i < Math.min(charPos, content.length); i++) {
      if (content[i] === '\n') line++;
    }
    return line;
  }

  /** Count lines in a string */
  countLines(text) {
    const nlCount = (text.match(/\n/g) || []).length;
    // If text doesn't end with newline, the last "line" still counts
    if (text.length > 0 && !text.endsWith('\n')) return nlCount + 1;
    return Math.max(nlCount, 1);
  }

  /** Generate a unique numeric Qdrant point ID for a chunk of a file */
  makeChunkPointId(parentFileId, chunkIndex) {
    // Hash (parent_file_id, chunk_index) to produce a deterministic integer ID.
    // This avoids string IDs which Qdrant v1.x rejects as invalid.
    const hash = crypto.createHash('md5').update(`${parentFileId}\x01${chunkIndex}`).digest('hex');
    return parseInt(hash.substring(0, 8), 16);
  }

  /** Delete old chunk points for a file before re-indexing */
  async deleteOldChunks(parentId, relPath) {
    // Find all existing chunks for this parent ID and delete them.
    // We scroll by project_id + source to find matching points efficiently.
    let deleted = 0;
    
    try {
      const BATCH_SIZE = 50;
      let hasMore = true;

      while (hasMore) {
        const result = await this.client.scroll(this.collectionName, {
          limit: BATCH_SIZE,
          with_payload: false,
          filter: {
            must: [
              { key: 'project_id', match: { value: this.projectName } },
              { key: '_parent_file', match: { value: relPath } }
            ]
          }
        });

        if (result.points.length === 0) break;

        const idsToDelete = result.points.map(p => p.id);
        await this.client.delete(this.collectionName, { points: idsToDelete });
        deleted += idsToDelete.length;

        hasMore = result.points.length >= BATCH_SIZE;
      }
    } catch (err) {
      // If scroll by filter fails (older Qdrant versions), try brute-force approach
      console.warn(`[qdrant] chunk cleanup for ${relPath}: ${err.message}`);
      
      // Brute force: check known chunk IDs up to a reasonable limit
      const idsToDelete = [];
      for (let i = 0; i < 50; i++) {
        try {
          const chunkId = this.makeChunkPointId(parentId, i);
          await this.client.get(this.collectionName, { id: chunkId });
          idsToDelete.push(chunkId);
        } catch (_) { /* point doesn't exist — fine */ }
      }

      if (idsToDelete.length > 0) {
        await this.client.delete(this.collectionName, { points: idsToDelete });
        deleted += idsToDelete.length;
      }
    }

    return deleted;
  }

  /** Build payload for a single chunked point */
  async buildChunkedCodePayload(filePath, fullContent, relPath, docIndex, chunkIdx, totalChunks, chunkData) {
    const metadata = this.extractCodeMetadata(filePath, fullContent, relPath);
    const lang = this.detectLanguage(filePath);

    return {
      project_id: this.projectName,
      type: 'code',
      language: lang,
      source: relPath,           // Original file path (for grouping)
      _parent_file: relPath,     // Internal field for chunk cleanup queries
      
      // Chunk metadata — enables multi-snippet-per-file results in search
      parentId: this.makePointId('code', relPath),  // Base ID of the parent file point
      chunkIndex: chunkIdx,
      totalChunks: totalChunks,
      
      // Line range within original file
      startLine: chunkData.startLine,
      endLine: chunkData.endLine,
      
      // Content — only this chunk's content (not full file)
      content: chunkData.content,
      
      // File-level metadata (shared across all chunks of the same file)
      summary: metadata.name || basename(filePath),
      kindDetail: metadata.kindDetail,
      scope: metadata.scope,
      workspace: metadata.workspace,
      exports: metadata.exports,
      imports: metadata.imports,
      symbolNames: metadata.symbolNames,
      
      // Reusable flag (computed from full file content)
      reusable: await this.isReusable(filePath, fullContent),
      timestamp: Date.now(),
    };
  }

  /** Build embedding text for a single chunked point */
  buildChunkedCodeText(relPath, fullContent, payload) {
    // For chunks, embed the chunk content itself (not weighted header).
    // Include file-level context as prefix so CodeBERT knows what file this belongs to.
    const lang = payload.language || 'text';
    
    return [
      `project:${this.projectName}`,
      `path:${relPath}`,
      `language:${lang}`,
      `kind:${payload.kindDetail}`,
      `chunk:${payload.chunkIndex + 1}/${payload.totalChunks}`,
      // Include file-level exports/imports for context (helps semantic matching)
      payload.exports?.length ? `exports: ${payload.exports.join(', ')}` : null,
      payload.imports?.length ? `imports: ${payload.imports.slice(0, 5).join(', ')}` : null,
      // The chunk content itself — this is what gets embedded for semantic search
      payload.content,
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
  makePointId(kind, relPath) { return parseInt(crypto.createHash('md5').update(`${this.projectName}\x01${kind}:${relPath}`).digest('hex').substring(0, 8), 16); }
  hashContent(content) { return crypto.createHash('md5').update(content).digest('hex'); }
  toProjectRelative(filePath) { return relative(PROJECT_ROOT, filePath).replace(/\\/g, '/'); }
  async loadSyncState() {
    try {
      const content = await fs.readFile(STATE_FILE, 'utf8');
      return JSON.parse(content);
    } catch (_) {
      return { lastSync: null };
    }
  }
  async saveSyncState(state) {
    const dir = dirname(STATE_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  }
}

module.exports = { GSDKnowledgeSync };
