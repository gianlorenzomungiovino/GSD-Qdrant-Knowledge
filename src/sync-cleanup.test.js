import { describe, it, expect, beforeEach } from 'vitest';

// We test the sync cleanup logic by creating a minimal mock of GSDKnowledgeSync.
// The real class requires a Qdrant connection; we extract and test the core
// deletion logic with mocked scroll/delete calls.

describe('deleteStaleProjectPoints — orphan cleanup for file-level points', () => {
  let instance;
  const projectName = 'test-project';

  beforeEach(() => {
    // Build a minimal instance without connecting to Qdrant
    const mockClient = {
      scroll: vi.fn(),
      delete: vi.fn().mockResolvedValue({ result: {} }),
    };
    instance = Object.create(require('./gsd-qdrant-template.js').GSDKnowledgeSync.prototype);
    instance.client = mockClient;
    instance.projectName = projectName;
    instance.collectionName = 'test_collection';
  });

  it('deletes points whose source file no longer exists on disk', async () => {
    // Simulate: seenIds has only 'src/kept.js' — deleted files are orphans.
    const seenIds = new Set(['src/kept.js']);

    // Qdrant scroll returns 3 project points: one alive, two stale.
    instance.client.scroll.mockResolvedValueOnce({
      points: [
        { id: 1, payload: { project_id: projectName, source: 'src/kept.js', type: 'code' } },
        { id: 2, payload: { project_id: projectName, source: 'src/deleted-a.js', type: 'code' } },
        { id: 3, payload: { project_id: projectName, source: 'src/deleted-b.ts', type: 'code' } },
      ],
      next_page_offset: null, // no more pages
    });

    const deleted = await instance.deleteStaleProjectPoints(seenIds);

    expect(deleted).toBe(2);
    // Verify delete was called with the two stale point IDs.
    expect(instance.client.delete).toHaveBeenCalledWith('test_collection', {
      points: [2, 3],
    });
  });

  it('skips points whose source file still exists on disk', async () => {
    const seenIds = new Set(['src/alive.js']);

    instance.client.scroll.mockResolvedValueOnce({
      points: [
        { id: 10, payload: { project_id: projectName, source: 'src/alive.js', type: 'code' } },
      ],
      next_page_offset: null,
    });

    const deleted = await instance.deleteStaleProjectPoints(seenIds);

    expect(deleted).toBe(0);
    // delete should NOT have been called.
    expect(instance.client.delete).not.toHaveBeenCalled();
  });

  it('handles pagination — deletes across multiple scroll pages', async () => {
    const seenIds = new Set(['src/only.js']);

    instance.client.scroll
      .mockResolvedValueOnce({
        points: [
          { id: 1, payload: { project_id: projectName, source: 'src/orphan-1.js', type: 'code' } },
        ],
        next_page_offset: 'page2_token',
      })
      .mockResolvedValueOnce({
        points: [
          { id: 2, payload: { project_id: projectName, source: 'src/only.js', type: 'doc' } }, // alive — skip
          { id: 3, payload: { project_id: projectName, source: 'src/orphan-2.ts', type: 'code' } },
        ],
        next_page_offset: null,
      });

    const deleted = await instance.deleteStaleProjectPoints(seenIds);

    expect(deleted).toBe(2); // orphan-1 + orphan-2
  });

  it('skips points with missing source or type fields', async () => {
    const seenIds = new Set();

    instance.client.scroll.mockResolvedValueOnce({
      points: [
        { id: 1, payload: { project_id: projectName } }, // no source/type → skip silently
        { id: 2, payload: { project_id: projectName, type: 'code' } }, // no source → skip
        { id: 3, payload: { project_id: projectName, source: 'src/orphan.js', type: 'code' } },
      ],
      next_page_offset: null,
    });

    const deleted = await instance.deleteStaleProjectPoints(seenIds);

    expect(deleted).toBe(1); // only the valid orphan point is deleted.
  });

  it('does not delete points from other projects', async () => {
    const seenIds = new Set();

    instance.client.scroll.mockResolvedValueOnce({
      points: [
        { id: 1, payload: { project_id: 'other-project', source: 'src/orphan.js', type: 'code' } },
        { id: 2, payload: { project_id: projectName, source: 'src/also-orphan.ts', type: 'doc' } },
      ],
      next_page_offset: null,
    });

    const deleted = await instance.deleteStaleProjectPoints(seenIds);

    expect(deleted).toBe(1); // only the point matching this.projectName is deleted.
  });

  it('returns 0 when no points exist for this project', async () => {
    const seenIds = new Set(['src/file.js']);

    instance.client.scroll.mockResolvedValueOnce({
      points: [],
      next_page_offset: null,
    });

    const deleted = await instance.deleteStaleProjectPoints(seenIds);

    expect(deleted).toBe(0);
  });
});

describe('deleteMissingPoints — syncState-based cleanup for file-level points', () => {
  let instance;
  const projectName = 'test-project';
  // Helper to build indexedFileKey with SOH character.
  const ikf = (type, path) => `indexed_${type}\x01${path}`;

  beforeEach(() => {
    const mockClient = {
      scroll: vi.fn(),
      delete: vi.fn().mockResolvedValue({ result: {} }),
    };
    instance = Object.create(require('./gsd-qdrant-template.js').GSDKnowledgeSync.prototype);
    instance.client = mockClient;
    instance.projectName = projectName;
    instance.collectionName = 'test_collection';
  });

  it('deletes points for files no longer on disk', async () => {
    // seenIds: only src/alive.js exists. deleted-a.js and deleted-b.ts are gone.
    const seenIds = new Set(['src/alive.js']);

    // syncState has entries for all three files (one unchanged, two stale).
    const syncState = {};
    syncState[ikf('code', 'src/alive.js')] = { path: 'src/alive.js', type: 'code', hash: 'abc' };
    syncState[ikf('code', 'src/deleted-a.js')] = { path: 'src/deleted-a.js', type: 'code', hash: 'def' };
    syncState[ikf('doc', 'src/deleted-b.ts')] = { path: 'src/deleted-b.ts', type: 'doc', hash: 'ghi' };

    // Compute the actual point IDs that makePointId would generate for each candidate.
    const deletedAId = instance.makePointId('code', 'src/deleted-a.js');
    const deletedBId = instance.makePointId('doc', 'src/deleted-b.ts');

    // Qdrant scroll returns all three points — the two stale ones must have IDs matching makePointId.
    instance.client.scroll.mockResolvedValueOnce({
      points: [
        { id: 1, payload: { project_id: projectName, source: 'src/alive.js', type: 'code' } },
        { id: deletedAId, payload: { project_id: projectName, source: 'src/deleted-a.js', type: 'code' } },
        { id: deletedBId, payload: { project_id: projectName, source: 'src/deleted-b.ts', type: 'doc' } },
      ],
      next_page_offset: null,
    });

    const deleted = await instance.deleteMissingPoints(seenIds, syncState);

    expect(deleted).toBe(2); // deleted-a.js + deleted-b.ts removed.
  });

  it('skips entries with missing path or type (legacy repair)', async () => {
    const seenIds = new Set(['src/file.js']);

    const syncState = {};
    // Legacy entry without type — should be skipped (not deleted from Qdrant).
    syncState['indexed_legacy\x01src/old.js'] = { path: 'src/old.js' };

    instance.client.scroll.mockResolvedValueOnce({
      points: [],
      next_page_offset: null,
    });

    const deleted = await instance.deleteMissingPoints(seenIds, syncState);

    expect(deleted).toBe(0); // no valid candidates to delete.
  });

  it('does not delete cross-project points with same path', async () => {
    const seenIds = new Set();

    const syncState = {};
    syncState[ikf('code', 'src/same-path.js')] = { path: 'src/same-path.js', type: 'code', hash: 'xyz' };

    // Qdrant returns a point with the same ID but different project_id.
    instance.client.scroll.mockResolvedValueOnce({
      points: [
        { id: 1, payload: { project_id: 'other-project', source: 'src/same-path.js', type: 'code' } },
      ],
      next_page_offset: null,
    });

    const deleted = await instance.deleteMissingPoints(seenIds, syncState);

    expect(deleted).toBe(0); // project_id mismatch → not deleted.
  });
});

describe('indexedFileKey — unique key format for file-level points', () => {
  let instance;

  beforeEach(() => {
    instance = Object.create(require('./gsd-qdrant-template.js').GSDKnowledgeSync.prototype);
  });

  it('produces a delimiter-separated key with type and path', () => {
    const key = instance.indexedFileKey('code', 'src/gsd_qdrant_mcp/index.js');
    expect(key).toMatch(/^indexed_code\x01/);
    expect(key.endsWith('src/gsd_qdrant_mcp/index.js')).toBe(true);
  });

  it('handles paths with underscores without ambiguity', () => {
    const key = instance.indexedFileKey('doc', 'gsd/milestones/M006/slices/S01/UAT.md');
    expect(key).toMatch(/^indexed_doc\x01/);
  });

  it('different types produce different keys for the same path', () => {
    const codeKey = instance.indexedFileKey('code', 'src/file.js');
    const docKey = instance.indexedFileKey('doc', 'src/file.js');
    expect(codeKey).not.toBe(docKey);
  });

  it('same type and path produce identical keys (deterministic)', () => {
    const key1 = instance.indexedFileKey('code', 'src/file.ts');
    const key2 = instance.indexedFileKey('code', 'src/file.ts');
    expect(key1).toBe(key2);
  });
});
