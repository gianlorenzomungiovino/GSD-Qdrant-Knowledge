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
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.rb', '.php', '.go', '.rs', '.java', '.kt', '.scala', '.cs', '.html', '.css', '.scss', '.sass', '.less', '.sql', '.sh', '.bash', '.zsh', '.ps1', '.vue', '.svelte', '.astro'
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
    // bge-m3: multilingual (100+ languages), optimized for retrieval, 1024-dim Cosine embeddings.
    // Replaces codebert-base which was English-only and performed poorly on non-English queries.
    this.vectorName = process.env.VECTOR_NAME || 'bge-m3-1024';
    this.embeddingDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '1024', 10);
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'Xenova/bge-m3';
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

      // Dimension mismatch — model changed (e.g. codebert-768 → bge-m3-1024).
      if (namedVector && namedVector.size !== this.embeddingDimensions) {
        console.log(`[qdrant] Vector dimension mismatch: ${this.collectionName} has ${namedVector.size}-dim (${this.vectorName}), need ${this.embeddingDimensions}. Recreating collection...`);
        await this.client.deleteCollection(collectionName);
        await this.client.createCollection(collectionName, {
          vectors: { [this.vectorName]: { size: this.embeddingDimensions, distance: 'Cosine' } },
        });
        console.log(`[qdrant] Collection ${collectionName} recreated with ${this.vectorName} (${this.embeddingDimensions}-dim). Full re-index required.`);

        // Reset sync state to force full re-index
        try { await fs.writeFile(STATE_FILE, JSON.stringify({ lastSync: null, indexed: {} }, null, 2)); } catch (_) {}
        return;
      }

      if (!namedVector) throw new Error(`Collection ${collectionName} exists without named vector ${this.vectorName}. Recreate it.`);
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
    let fileIndex = 0;
    
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
    
    // Index code files — large files (>32K chars) get chunked, small files stay whole.
    for (const filePath of codeFiles) {
      fileIndex += 1;
      const content = await fs.readFile(filePath, 'utf8');
      const relPath = this.toProjectRelative(filePath);
      const fileHash = this.hashContent(content);
      seenIds.add(relPath);

      // Check if already indexed — skip entire file if hash unchanged (for small files)
      // For large-file chunks, check the first chunk's hash as a proxy for full-file change.
      const codeStateKey = this.indexedFileKey('code', relPath);
      // Large-file threshold: bge-m3 context window ≈ 8192 tokens (~32K chars).
      // Files exceeding this are chunked at 8000 chars with enriched metadata.
      // In THIS project (as of M006): only src/gsd-qdrant-template.js (46K) qualifies as 'large'.
      // cli.js (30.5K) is close but stays under threshold — single-point indexed.
      const isLargeFile = content.length > 32000;

      if (!isLargeFile && syncState[codeStateKey]?.hash === fileHash) {
        console.log(`[sync] ${relPath} ⏭️  unchanged`);
        continue;
      }

      // For large files, also check chunk-level hashes to detect partial changes.
      if (isLargeFile) {
        const lang = this.detectLanguage(filePath);
        const existingChunks = syncState[codeStateKey]?.chunks || [];
        const newChunks = this.chunkLargeFileContent(content, 8000);
        
        let allChunksUnchanged = true;
        for (let i = 0; i < newChunks.length; i++) {
          if (!existingChunks[i] || existingChunks[i].hash !== this.hashContent(newChunks[i].text)) {
            allChunksUnchanged = false;
            break;
          }
        }
        
        // If chunk count changed or any chunk is different, we need to re-index.
        if (allChunksUnchanged && newChunks.length === existingChunks.length) {
          console.log(`[sync] ${relPath} ⏭️  unchanged (${newChunks.length} chunks)`);
          continue;
        }

        // Delete old large-file chunk points before inserting updated ones.
        const oldChunkIds = (existingChunks || []).map((c, idx) => 
          this.makePointId('large-file-chunk', `${relPath}\x02chunk-${idx}`)
        );
        if (oldChunkIds.length > 0) {
          try { await this.client.delete(this.collectionName, { points: oldChunkIds }); } catch (_) {}
        }

        // Extract file-level metadata once (for richer per-chunk payloads)
        const allSignatures = this.extractSignatures(content).slice(0, 50);
        const allComments = this.extractComments(content).slice(0, 30);
        const codeMetaForFile = this.extractCodeMetadata(filePath, content, relPath);
        const allSnippetIds = this.extractGsdIds(relPath, content);

        // Index each chunk as a separate point.
        const t0 = Date.now();
        for (const chunkInfo of newChunks) {
          const chunkId = this.makePointId('large-file-chunk', `${relPath}\x02chunk-${chunkInfo.index}`);
          
          // Build enriched payload with file-level context + per-chunk data
          const fullFileContext = {
            allSignatures,
            allComments,
            allExports: codeMetaForFile.exports || [],
            allImports: codeMetaForFile.imports || [],
            allSymbolNames: codeMetaForFile.symbolNames || [],
            allSnippetIds,
            fullContent: content // for related doc matching
          };
          
          const codePayload = await this.buildLargeFileChunkPayload(filePath, chunkInfo.text, relPath, docIndex, chunkInfo, fullFileContext);
          const vectorText = this.buildLargeFileChunkText(relPath, lang || 'javascript', chunkInfo, chunkInfo.text, codePayload);
          
          // Defensive: warn if a large-file chunk unexpectedly exceeds limits
          if (vectorText.length > 16000) {
            console.warn(`[embed-warn] ${relPath} chunk-${chunkInfo.index}: embedding text is ${vectorText.length} chars — unusually large for an 8K chunk.`);
          }

          const vector = await this.embedText(vectorText.slice(0, 8192));

          await this.client.upsert(this.collectionName, { points: [{ id: chunkId, vector: { [this.vectorName]: vector }, payload: codePayload }] });
        }

        // Update sync state with new chunk hashes.
        const updatedChunks = newChunks.map((c) => ({ path: relPath, type: 'code', hash: this.hashContent(c.text), index: c.index }));
        syncState[codeStateKey] = { 
          path: relPath, 
          type: isLargeFile ? 'large-file-chunk' : 'code', 
          hash: fileHash,
          chunks: updatedChunks,
          totalChunks: newChunks.length
        };

        const elapsed = Date.now() - t0;
        console.log(`[large-file] ${relPath} indicizzato in ${newChunks.length} chunk (8000 max) (${elapsed}ms)`);
        updated += 1; // Count as one "file" processed
      } else {
        // Small file: single point with full-file embedding text (metadata header + content).
        const fileId = this.makePointId('code', relPath);

        const codePayload = await this.buildCodePayload(filePath, content, relPath, docIndex);
        const vectorText = this.buildFullFileCodeText(relPath, content, codePayload);
        
        // Warn if embedding text approaches the 32K limit (bge-m3 token budget)
        if (vectorText.length > 30000) {
          console.warn(`[embed-warn] ${relPath}: embedding text is ${vectorText.length} chars (${Math.round(vectorText.length/320)}% of 32K limit). Content was truncated to fit.`);
        } else if (vectorText.length > 25600) {
          console.log(`[embed-info] ${relPath}: embedding text is ${vectorText.length} chars (${Math.round(vectorText.length/320)}% of 32K limit).`);
        }

        const t0 = Date.now();
        const vector = await this.embedText(vectorText.slice(0, 8192)); // Cap text for embedding

        await this.client.upsert(this.collectionName, { points: [{ id: fileId, vector: { [this.vectorName]: vector }, payload: codePayload }] });

        syncState[codeStateKey] = { path: relPath, type: 'code', hash: fileHash };
        updated += 1; // Count as one "file" updated (one point per file)
        console.log(`[sync] ${relPath} ✅ indicizzato (${Date.now() - t0}ms)`);
      }
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
   * Clear ALL points belonging to this project from the collection.
   * Convenience wrapper around deleteAllProjectPoints().
   * Used by --force-reindex to wipe before a fresh sync pass.
   */
  async clearAllProjectPoints() {
    const deleted = await this.deleteAllProjectPoints();
    console.log(`[clear] Deleted ${deleted} point(s) for project '${this.projectName}'`);
    return deleted;
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
    const pointsToDelete = [];
    let offset = null;
    while (true) {
      const scrollResult = await this.client.scroll(this.collectionName, {
        limit: 200,
        offset,
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

      if (!scrollResult.next_page_offset || scrollResult.points.length === 0) break;
      offset = scrollResult.next_page_offset;
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
    const allPointsToDelete = [];
    let offset = null;
    while (true) {
      const scrollResult = await this.client.scroll(this.collectionName, {
        limit: BATCH_SIZE,
        offset,
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
        break;
      }
      
      for (const point of scrollResult.points) {
        // Double-check project_id as a safety net
        if (point.payload?.project_id !== this.projectName) continue;
        
        const relPath = point.payload?.source;
        const type = point.payload?.type;
        if (!relPath || !type) continue;
        
        // If the file is still on disk, skip it
        if (seenIds.has(relPath)) continue;
        
        allPointsToDelete.push(point.id);
      }

      if (!scrollResult.next_page_offset) break;
      offset = scrollResult.next_page_offset;
    }

    if (allPointsToDelete.length > 0) {
      await this.client.delete(this.collectionName, { points: allPointsToDelete });
      deleted += allPointsToDelete.length;
      console.log(`  🗑️  Deleted ${allPointsToDelete.length} stale point(s) from project '${this.projectName}'`);
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

  /**
   * Build full-file embedding text with enriched metadata prepended.
   * All extracted metadata (project, path, language, kind, exports, imports, symbols, comments)
   * is placed BEFORE the file content to leverage positional weighting of bge-m3 — early tokens
   * receive higher attention in the transformer encoder.
   * Total length strictly capped at 32K chars; if exceeded, body content is trimmed from the end.
   * Comments are truncated to first-line summaries (max ~100 chars each) so they don't eat into
   * the content budget — full JSDoc blocks can be hundreds of characters long.
   * @param {string} relPath - Relative path of the file within the project
   * @param {string} content - Full raw file content
   * @param {object} payload - Payload object (from buildCodePayload or extractCodeMetadata) containing exports, imports, symbolNames, comments, etc.
   * @returns {string} Embedding text with metadata header + full content (≤32K chars guaranteed)
   */
  buildFullFileCodeText(relPath, content, payload = {}) {
    const MAX_TOTAL_CHARS = 32000;

    // --- Helper: truncate comment to first meaningful line (~100 chars max) ---
    const shortComment = (c) => {
      if (!c || typeof c !== 'string') return '';
      let cleaned = c.replace(/\/\*\*?|\*\/|\*/g, '').trim();
      const nlIdx = cleaned.indexOf('\n');
      if (nlIdx > 0) cleaned = cleaned.slice(0, nlIdx).trim();
      return cleaned.length > 100 ? cleaned.slice(0, 97) + '...' : cleaned;
    };

    // --- Metadata header: all structural elements prepended for positional weighting ---
    const commentText = payload.comments?.length
      ? `comments:${payload.comments.map(shortComment).slice(0, 8).join(' | ')}`
      : null;

    const headerParts = [
      `project:${this.projectName}`,
      `path:${relPath}`,
      `language:${payload.language || this.detectLanguage(relPath)}`,
      `kind:${payload.kindDetail || 'code'}`,
      payload.exports?.length ? `exports:${payload.exports.slice(0, 10).join(', ')}` : null,
      payload.imports?.length ? `imports:${payload.imports.slice(0, 5).join(', ')}` : null,
      payload.symbolNames?.length ? `symbols:${payload.symbolNames.join(', ')}` : null,
      commentText,
    ].filter(Boolean);

    const metadataHeader = headerParts.join('\n');

    // --- Full content appended after metadata ---
    let fullText = metadataHeader + '\n\n' + content;

    // --- Hard cap: ensure total never exceeds MAX_TOTAL_CHARS ---
    if (fullText.length > MAX_TOTAL_CHARS) {
      const availableForContent = Math.max(0, MAX_TOTAL_CHARS - metadataHeader.length - 2);
      fullText = metadataHeader + '\n\n' + content.slice(0, availableForContent);

      // Add truncation marker only if there's room (≤3 chars overhead)
      if (content.length > availableForContent && fullText.length <= MAX_TOTAL_CHARS - 65) {
        fullText += `\n/* ... truncated (${content.length - availableForContent} omitted) */`;
      }
    }

    // Final safety: trim to exactly MAX_TOTAL_CHARS if still over (should never happen, but defensive)
    return fullText.slice(0, MAX_TOTAL_CHARS);
  }

  /**
   * Split large file content into fixed-size chunks for embedding.
   * Used when a file exceeds the ~32K char limit (bge-m3 token budget).
   * Chunks are non-overlapping, each gets type='large-file-chunk' in payload.
   * @param {string} content - Full file content to chunk
   * @param {number} maxChars - Maximum characters per chunk (default 8000)
   * @returns {{ text: string, index: number, totalChunks: number }[]} Array of chunks with metadata
   */
  chunkLargeFileContent(content, maxChars = 8000) {
    const chunks = [];
    let offset = 0;
    while (offset < content.length) {
      const slice = content.slice(offset, offset + maxChars);
      // Try to break at a line boundary if not at the very end
      let breakPoint = slice.length;
      if (breakPoint === maxChars && offset + maxChars < content.length) {
        const lastNewline = slice.lastIndexOf('\n');
        if (lastNewline > maxChars * 0.5) { // Only break at newline if we're past halfway
          breakPoint = lastNewline + 1; // Include the newline
        }
      }
      chunks.push({ text: content.slice(offset, offset + breakPoint), index: chunks.length });
      offset += breakPoint;
    }
    return chunks.map((chunk) => ({ ...chunk, totalChunks: chunks.length }));
  }

  /**
   * Build payload for a large-file chunk (type='large-file-chunk').
   * Enriched with file-level metadata (signatures, exports, imports, GSD IDs) plus per-chunk info.
   * Similar to buildCodePayload but includes chunk position metadata.
   */
  async buildLargeFileChunkPayload(filePath, content, relPath, docIndex = null, chunkInfo, fullFileContext = {}) {
    const lang = this.detectLanguage(filePath);
    
    // Per-chunk signatures (from the actual slice) + file-level signatures (for broader context)
    const perChunkSignatures = this.extractSignatures(content).slice(0, 20);
    const allSignatures = fullFileContext.allSignatures || [];
    const combinedSignatures = [...new Set([...allSignatures.slice(0, 30), ...perChunkSignatures])].slice(0, 50);

    // Per-chunk comments + file-level comments for context
    const perChunkComments = this.extractComments(content).slice(0, 10);
    const allComments = fullFileContext.allComments || [];
    const combinedComments = [...new Set([...allComments.slice(0, 5), ...perChunkComments])].slice(0, 20);

    // Extract GSD IDs from both chunk and full file context
    const snippetIds = this.extractGsdIds(relPath, content);
    const allSnippetIds = fullFileContext.allSnippetIds || [];
    const combinedIds = [...new Set([...allSnippetIds, ...snippetIds])];

    // Find related documentation files based on shared GSD IDs (from docIndex)
    let relatedDocPaths = [];
    let relatedDocIds = [];
    if (docIndex && docIndex.length > 0) {
      const codeContentForMatching = fullFileContext.fullContent || content;
      const docMatches = this.findRelatedDocsForCode(relPath, codeContentForMatching, docIndex);
      relatedDocPaths = docMatches.map(d => d.path);
      relatedDocIds = docMatches.flatMap(d => d.ids);
    }

    return {
      project_id: this.projectName,
      type: 'large-file-chunk',
      subtype: 'file-chunk',
      language: lang,
      source: relPath,
      chunkIndex: chunkInfo.index,
      totalChunks: chunkInfo.totalChunks,
      summary: `${basename(filePath)} (chunk ${chunkInfo.index + 1}/${chunkInfo.totalChunks})`,
      content: content, // Chunk slice only — full file in related context
      signatures: combinedSignatures, // Combined per-chunk + file-level for richer embedding
      exports: fullFileContext.allExports || [],
      imports: fullFileContext.allImports || [],
      symbolNames: fullFileContext.allSymbolNames || [],
      comments: combinedComments,
      relatedDocPaths: relatedDocPaths,
      relatedDocIds: relatedDocIds,
      gsdIds: combinedIds, // GSD IDs for cross-reference with docs
      timestamp: Date.now(),
      hash: this.hashContent(content)
    };
  }

  /**
   * Build embedding text for a large-file chunk.
   * Prepends file-level metadata with weighted header (signatures/exports/imports) + chunk position before the content slice.
   * Similar structure to buildFullFileCodeText but includes chunk context and smaller header budget.
   */
  buildLargeFileChunkText(relPath, lang, chunkInfo, contentSlice, payload = {}) {
    const MAX_WEIGHTED_HEADER = 1500; // chars for signatures + exports + imports (smaller than full file)
    
    // --- Weighted header: structural elements first (for better embedding quality) ---
    const sigText = payload.signatures?.join(' | ') || '';
    const exportText = payload.exports?.length ? `EXPORTS:${payload.exports.join(', ')}` : '';
    const importText = payload.imports?.length ? `IMPORTS:${payload.imports.join(', ')}` : '';
    
    let headerParts = [sigText, exportText, importText].filter(Boolean);
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

    // --- Body: file-level metadata + chunk position + content slice ---
    const bodyParts = [
      `project:${this.projectName}`,
      `path:${relPath}`,
      `language:${lang}`,
      `chunk:${chunkInfo.index + 1}/${chunkInfo.totalChunks}`,
      payload.gsdIds?.length ? `gsd-ids:${payload.gsdIds.join(', ')}` : null,
    ].filter(Boolean);

    let body = bodyParts.join('\n');
    
    return header + '\n' + body + '\n\n' + contentSlice;
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
