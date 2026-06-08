/**
 * Related docs module — extracts GSD IDs from ranked results,
 * performs a Qdrant search for docs containing those IDs,
 * and returns grouped results for CLI output.
 *
 * Usage:
 *   const { findRelatedDocs } = require('./related-docs');
 */

/**
 * Find related documentation files for a set of ranked results.
 *
 * Extracts GSD IDs (M001, S01, T01, R001, D003) from all ranked results,
 * performs a Qdrant search for docs containing those IDs,
 * and returns grouped results as [{ids, docPaths, descriptions}].
 *
 * @param {Object} sync — GSDKnowledgeSync instance (has .embedText)
 * @param {string} collectionName — Qdrant collection name
 * @param {Array<Object>} rankedResults — primary ranked results
 * @param {Object} options — search options
 * @param {string} options.vectorName — vector name (default: 'bge-m3-1024')
 * @param {number} options.limit — max doc groups (default: 5)
 * @returns {Promise<Array<Object>>} related docs as [{ids, docPaths, descriptions}]
 */
async function findRelatedDocs(sync, collectionName, rankedResults, options = {}) {
  const {
    vectorName = process.env.VECTOR_NAME || 'bge-m3-1024',
    limit = 5,
  } = options;

  // Extract all GSD IDs from all ranked results
  const allIds = new Set();
  for (const result of rankedResults) {
    if (!result || typeof result !== 'object') continue;

    // Extract from payload.relatedDocIds
    if (result.relatedDocIds && Array.isArray(result.relatedDocIds)) {
      for (const id of result.relatedDocIds) allIds.add(id);
    }

    // Extract from source path
    const source = result.source || result.path || '';
    const pathIds = source.match(/\b(M\d{3}|S\d{2}|T\d{2}|R\d{3}|D\d{3})\b/g) || [];
    for (const id of pathIds) allIds.add(id);

    // Extract from content/text
    const content = result.content || result.text || '';
    const contentIds = content.match(/\b(M\d{3}|S\d{2}|T\d{2}|R\d{3}|D\d{3})\b/g) || [];
    for (const id of contentIds) allIds.add(id);
  }

  if (allIds.size === 0) {
    return [];
  }

  const idsArray = [...allIds];
  const idCount = idsArray.length;
  if (process.env.GSD_QDRANT_VERBOSE === '1') {
    console.log(`[related-docs] Found ${idCount} GSD IDs: ${idsArray.join(', ')}`);
  }

  // Build embedding using the SAME local model as primary search.
  let vector;
  try {
    vector = await sync.embedText(idsArray.join(' '));
  } catch (err) {
    return [];
  }

  // Search for docs
  let hits;
  try {
    hits = await sync.client.search(collectionName, {
      vector: { name: vectorName, vector },
      limit: Math.max(limit * 3, 15),
      with_payload: true,
      with_vector: false,
      filter: {
        must: [{ key: 'type', match: { value: 'doc' } }],
      },
    });
  } catch (err) {
    return [];
  }

  // Group by shared IDs
  const docGroups = {};
  for (const hit of hits) {
    const payload = hit.payload || {};
    const docIds = payload.relatedDocIds || payload.gsdIds || [];
    const sharedIds = docIds.filter(id => allIds.has(id));

    if (sharedIds.length === 0) continue;

    const key = sharedIds.join(',');
    if (!docGroups[key]) {
      docGroups[key] = { ids: sharedIds, docPaths: [], descriptions: [] };
    }
    docGroups[key].docPaths.push(payload.source || payload.path || '');
    docGroups[key].descriptions.push(payload.title || payload.summary || '');
  }

  const relatedDocs = Object.values(docGroups);
  relatedDocs.sort((a, b) => b.docPaths.length - a.docPaths.length);

  const filtered = relatedDocs.slice(0, limit);

  return filtered;
}

module.exports = { findRelatedDocs };
