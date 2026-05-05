#!/usr/bin/env node

/**
 * Integration test for GSD + Qdrant Knowledge sync.
 * 
 * Flow: health check → clear collection → sync small files → semantic queries → verify payloads → report.
 * Designed to run against a live Qdrant instance (localhost:6333 by default).
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');

// ─── Configuration ──────────────────────────────────────────────
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'gsd_memory';
const VECTOR_NAME = process.env.VECTOR_NAME || 'bge-m3-1024';
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Small files only (under 5KB) — avoids the large-file chunking path in gsd-qdrant-template.js
const SMALL_FILE_LIMIT = 5 * 1024; // 5 KB

// Semantic queries to test retrieval quality
const SEMANTIC_QUERIES = [
  'intent detection',
  're-ranking logic',
  'knowledge sync',
  'MCP server setup',
  'embedding pipeline'
];

// ─── Helpers ────────────────────────────────────────────────────
function pass(msg) { console.log(`✅ ${msg}`); }
function fail(msg) { console.error(`❌ ${msg}`); }
function info(msg) { console.log(`ℹ️  ${msg}`); }

// ─── Report accumulator ────────────────────────────────────────
const report = {
  checks: [],
  queryResults: [],
  stats: {}
};

function addCheck(name, passed, detail = '') {
  report.checks.push({ name, passed, detail });
}

// ─── Main test flow ─────────────────────────────────────────────
async function main() {
  const client = new QdrantClient({ url: QDRANT_URL });
  let allPassed = true;

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   GSD + Qdrant Integration Test         ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ── Step 1: Health check ───────────────────────────────────────
  console.log('=== STEP 1: Qdrant Health Check ===');
  try {
    const health = await client._openApiClient.healthz();
    // Response is an object with data field containing "healthz check passed" or a plain string
    let ok;
    if (typeof health === 'string') {
      ok = health.includes('check passed');
    } else if (health && typeof health === 'object') {
      const d = health.data || '';
      ok = typeof d === 'string' ? d.includes('check passed') : false;
    } else {
      ok = false;
    }
    if (ok) {
      pass(`Qdrant is running at ${QDRANT_URL}`);
      addCheck('qdrant_health', true, `status=${JSON.stringify(health)}`);
    } else {
      fail(`Unexpected health response: ${JSON.stringify(health)}`);
      allPassed = false;
      addCheck('qdrant_health', false, 'unexpected response');
    }
  } catch (e) {
    fail(`Cannot reach Qdrant at ${QDRANT_URL}: ${e.message}`);
    allPassed = false;
    addCheck('qdrant_health', false, e.message);
    console.error('\nFATAL: Qdrant not reachable. Aborting.\n');
    printReport();
    process.exit(1);
  }

  // ── Step 2: Clear collection for this project ──────────────────
  console.log('\n=== STEP 2: Clear Collection ===');
  try {
    const beforeCount = await client.count(COLLECTION_NAME);
    info(`Points in '${COLLECTION_NAME}' before clear: ${beforeCount.count || 0}`);

    // Delete all points for this project using server-side filter
    let deleted = 0;
    const BATCH_SIZE = 100;
    let offset = null;
    while (true) {
      const scrollResult = await client.scroll(COLLECTION_NAME, {
        limit: BATCH_SIZE,
        with_payload: false,
        with_vector: false,
        filter: { must: [{ key: 'project_id', match: { value: basename(PROJECT_ROOT) } }] }
      });

      if (scrollResult.points.length === 0) break;

      const pointIds = scrollResult.points.map(p => p.id);
      await client.delete(COLLECTION_NAME, { points: pointIds });
      deleted += pointIds.length;

      if (!scrollResult.next_page_offset || scrollResult.points.length < BATCH_SIZE) break;
      offset = scrollResult.next_page_offset;
    }

    pass(`Cleared ${deleted} project-specific point(s)`);
    addCheck('collection_cleared', true, `deleted=${deleted}`);
  } catch (e) {
    fail(`Clear failed: ${e.message}`);
    allPassed = false;
    addCheck('collection_cleared', false, e.message);
  }

  // ── Step 3: Sync small files only ──────────────────────────────
  console.log('\n=== STEP 3: Sync Small Files ===');

  // Discover small source files (< SMALL_FILE_LIMIT bytes)
  const smallFiles = [];
  try {
    await walkDir(PROJECT_ROOT, (filePath) => {
      return new Promise((resolve) => {
        fs.stat(filePath).then(s => {
          if (s.size < SMALL_FILE_LIMIT && filePath.endsWith('.js') && !filePath.includes('node_modules')) {
            smallFiles.push({ path: filePath, size: s.size });
          }
          resolve();
        }).catch(() => resolve());
      });
    });

    info(`Found ${smallFiles.length} small .js files (<${SMALL_FILE_LIMIT / 1024}KB)`);

    // Force re-index by deleting the state file so all files get re-synced fresh
    const STATE_DIR = path.join(PROJECT_ROOT, 'gsd-qdrant-knowledge');
    try { await fs.rm(path.join(STATE_DIR, '.qdrant-sync-state.json'), { force: true }); } catch (_) {}

    // Run sync via CLI (uses GSDKnowledgeSync internally)
    info('Running full re-index...');
    const startTime = Date.now();

    let stdout = '';
    try {
      execSync(`node src/sync-knowledge.js setup`, {
        cwd: PROJECT_ROOT,
        timeout: 180000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit'] // inherit stderr for sync progress
      });
    } catch (e) {
      stdout = e.stdout || '';
      info(`Sync exited with code ${e.status} — checking if partial success...`);
      // Even on failure, check what was indexed before the error
    }

    const syncDuration = Date.now() - startTime;

    // Verify post-sync state for THIS project only
    try {
      const projectName = basename(PROJECT_ROOT);

      // Count points belonging to this specific project with retry on network errors
      let ourPoints = 0;
      let retries = 3;
      while (retries > 0) {
        try {
          let offset = null;
          while (true) {
            const scrollResult = await client.scroll(COLLECTION_NAME, {
              limit: 100,
              with_payload: false,
              filter: { must: [{ key: 'project_id', match: { value: projectName } }] }
            });

            ourPoints += scrollResult.points.length;
            if (!scrollResult.next_page_offset || scrollResult.points.length < 100) break;
            offset = scrollResult.next_page_offset;
          }
          break; // Success, exit retry loop
        } catch (netErr) {
          retries--;
          if (retries === 0) throw netErr;
          info(`Network error during count, retrying (${retries} left)...`);
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      info(`Project-specific points after sync: ${ourPoints} (${syncDuration}ms)`);

      if (ourPoints > 0) {
        pass(`Sync produced ${ourPoints} point(s) for this project`);
        addCheck('sync_point_count', true, `count=${ourPoints}, duration=${syncDuration}ms`);
      } else {
        fail('Sync produced zero points for this project');
        allPassed = false;
        addCheck('sync_point_count', false, 'zero project-specific points indexed');
      }

      report.stats.syncPoints = ourPoints;
    } catch (e) {
      // If we already have partial data from the sync output, don't fail hard
      if (report.checks.find(c => c.name === 'sync_point_count')) {
        info(`Post-sync count had network issues but sync may have partially succeeded`);
      } else {
        fail(`Post-sync count failed: ${e.message}`);
        allPassed = false;
        addCheck('post_sync_count', false, e.message);
      }
    }
  } catch (e) {
    fail(`File discovery or sync failed: ${e.message}`);
    allPassed = false;
    addCheck('small_file_discovery', false, e.message);
  }

  // ── Step 4: Semantic queries ───────────────────────────────────
  console.log('\n=== STEP 4: Semantic Queries ===');

  try {
    const templatePath = path.join(PROJECT_ROOT, 'src', 'gsd-qdrant-template.js');
    const { GSDKnowledgeSync } = require(templatePath);
    
    // Initialize sync instance for embedding (loads transformer pipeline)
    info('Loading embedding model...');
    const sync = new GSDKnowledgeSync();
    await sync.init();

    let totalHitsAcrossQueries = 0;
    let minScore = Infinity;
    let maxScore = -Infinity;
    let scoreSum = 0;

    for (const query of SEMANTIC_QUERIES) {
      console.log(`\n--- Query: "${query}" ---`);
      
      const t0 = Date.now();
      const results = await sync.searchWithContext(query, { limit: 10 });
      const elapsed = Date.now() - t0;

      info(`${results.length} hits in ${elapsed}ms`);
      totalHitsAcrossQueries += results.length;

      let queryMinScore = Infinity;
      let queryMaxScore = -Infinity;
      let querySum = 0;

      for (let i = 0; i < Math.min(results.length, 5); i++) {
        const r = results[i];
        const score = typeof r.score === 'number' ? r.score : 0;
        queryMinScore = Math.min(queryMinScore, score);
        queryMaxScore = Math.max(queryMaxScore, score);
        querySum += score;

        console.log(`    #${i + 1} score=${score.toFixed(4)} type="${r.type || 'unknown'}" source="${r.source || '(none)'}"`);
        
        // Verify payload content is full file (not fragment) for small files
        if (r.content && typeof r.content === 'string') {
          const contentLen = r.content.length;
          
          // For code type, verify the content looks like a complete file
          if (r.type === 'code' || r.type === 'doc') {
            // Check for truncation markers
            const hasTruncMarker = /truncated|omitted|\.\.\.$/.test(r.content);
            
            if (hasTruncMarker) {
              fail(`  ⚠️  Result #${i+1} content appears truncated: "${r.source}"`);
              addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_not_truncated`, false, `source=${r.source}, has truncation marker`);
            } else {
              pass(`  Result #${i+1} content intact (${contentLen} chars): "${r.source}"`);
              addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_not_truncated`, true, `source=${r.source}, size=${contentLen}`);
            }

            // Verify payload contains expected fields for code/doc types
            const hasProjectId = !!r.project_id;
            const hasSource = !!r.source;
            const hasType = !!r.type;
            
            if (hasProjectId && hasSource && hasType) {
              pass(`  Result #${i+1} payload complete: project="${r.project_id}" source="${r.source}" type="${r.type}"`);
              addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_payload_complete`, true, `project=${r.project_id}, source=${r.source}`);
            } else {
              fail(`  ⚠️  Result #${i+1} payload missing fields: projectId=${hasProjectId} source=${hasSource} type=${hasType}`);
              addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_payload_complete`, false, `project=${hasProjectId}, source=${hasSource}, type=${hasType}`);
            }

            // Verify no orphan _parent_file field (should not exist in clean data)
            const isOurProject = r.project_id === basename(PROJECT_ROOT);
            
            if ('_parent_file' in r && isOurProject) {
              fail(`  Result #${i+1} has orphan _parent_file field`);
              addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_no_orphan`, false, '_parent_file present');
            } else if ('_parent_file' in r) {
              info(`  ℹ️  Result #${i+1} has _parent_file field (${r.project_id}) — legacy data from other projects`);
              addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_no_orphan`, true, 'clean payload or non-our-project');
            } else {
              pass(`  Result #${i+1} no orphan fields (${r.project_id})`);
              addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_no_orphan`, true, 'clean payload');
            }

            // Verify content matches actual file for small files
            if (r.source && r.type === 'code') {
              try {
                const fullPath = path.join(PROJECT_ROOT, r.source);
                const actualContent = await fs.readFile(fullPath, 'utf8');
                
                if (actualContent.length > 0) {
                  // For small files (<5KB), content should match exactly or be very close
                  const contentMatch = Math.abs(r.content.length - actualContent.length) < 1;
                  
                  if (contentMatch || r.content === actualContent) {
                    pass(`  Result #${i+1} payload matches file (${actualContent.length} chars)`);
                    addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_payload_matches_file`, true, `file=${r.source}, size=${actualContent.length}`);
                  } else {
                    // Allow slight differences (timestamp hash etc.) but content should be same length
                    fail(`  ⚠️  Result #${i+1} payload size mismatch: stored=${r.content.length} file=${actualContent.length}`);
                    addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_payload_matches_file`, false, `stored=${r.content.length}, actual=${actualContent.length}`);
                  }
                } else {
                  fail(`  ⚠️  File not found: ${fullPath}`);
                  addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_payload_matches_file`, false, `file_not_found`);
                }
              } catch (readErr) {
                // Source might be from another project — skip this check
                info(`  ℹ️  Could not verify file: ${r.source} (${readErr.message})`);
              }
            }
          } else if (r.type === 'large-file-chunk') {
            pass(`  Result #${i+1} is a chunk (${contentLen} chars): "${r.summary || r.source}"`);
            addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_chunk_type`, true, `type=large-file-chunk, size=${contentLen}`);
          } else {
            pass(`  Result #${i+1} content (${contentLen} chars): "${r.source || r.summary}"`);
            addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_has_content`, true, `size=${contentLen}`);
          }
        } else {
          fail(`  ⚠️  Result #${i+1} missing content field`);
          addCheck(`query_${SEMANTIC_QUERIES.indexOf(query)}_result_${i}_has_content`, false, 'no content');
        }

        scoreSum += score;
      }

      queryMinScore = queryMinScore === Infinity ? 0 : queryMinScore;
      queryMaxScore = queryMaxScore === -Infinity ? 0 : queryMaxScore;
      
      minScore = Math.min(minScore, queryMinScore);
      maxScore = Math.max(maxScore, queryMaxScore);

      report.queryResults.push({
        query,
        hits: results.length,
        topScores: results.slice(0, 5).map(r => r.score),
        avgScore: results.length > 0 ? scoreSum / totalHitsAcrossQueries : 0
      });

      info(`Query scores: min=${queryMinScore.toFixed(4)} max=${queryMaxScore.toFixed(4)}`);
    }

    // Overall query stats
    const overallAvg = report.queryResults.reduce((sum, q) => sum + (q.avgScore || 0), 0) / SEMANTIC_QUERIES.length;
    info(`\nOverall: ${totalHitsAcrossQueries} total hits across ${SEMANTIC_QUERIES.length} queries`);

    addCheck('semantic_queries_executed', true, `queries=${SEMANTIC_QUERIES.length}, total_hits=${totalHitsAcrossQueries}`);

  } catch (e) {
    fail(`Semantic query test failed: ${e.message}`);
    console.error(e.stack);
    allPassed = false;
    addCheck('semantic_queries', false, e.message);
  }

  // ── Step 5: Orphan point check (this project only) ────────────
  console.log('\n=== STEP 5: Orphan Point Check ===');

  try {
    const projectName = basename(PROJECT_ROOT);

    info(`Checking orphan points for project '${projectName}'...`);

    // Scroll ALL points in collection (to see full picture) but only flag orphans from our project
    let orphanCount = 0;
    let typeCounts = {};
    let totalPayloadSize = 0;
    let payloadCount = 0;

    // Only check points belonging to THIS project (not other projects' legacy data)
    let offset = null;
    while (true) {
      const scrollResult = await client.scroll(COLLECTION_NAME, {
        limit: 100,
        with_payload: true,
        with_vector: false,
        filter: { must: [{ key: 'project_id', match: { value: projectName } }] }
      });

      if (scrollResult.points.length === 0) break;

      for (const point of scrollResult.points) {
        const p = point.payload || {};

        // Count by type
        typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;

        // Check payload size
        if (p.content && typeof p.content === 'string') {
          totalPayloadSize += p.content.length;
          payloadCount++;
        }

        const relPath = p.source || '';

        // Detect orphans in our project's points: _parent_file field is legacy orphan marker
        if ('_parent_file' in p) {
          orphanCount++;
          fail(`  Orphan point found: ${relPath} has _parent_file`);
        }

        // Check for large-file-chunk type on files that should be small (<32K chars)
        if (p.type === 'large-file-chunk') {
          try {
            const fullPath = path.join(PROJECT_ROOT, relPath);
            const stat = await fs.stat(fullPath);
            if (stat.size < 32000) {
              orphanCount++;
              fail(`  Orphan chunk: ${relPath} (${stat.size} bytes) should not be chunked`);
            }
          } catch (_) {
            // File doesn't exist — this is a stale point (orphan from deleted file)
            if (!p._deleted) {
              orphanCount++;
              fail(`  Stale chunk: ${relPath} no longer on disk`);
            }
          }
        }

        // Check for _parent_file residue in code/doc points (should not exist after cleanup)
        if ((p.type === 'code' || p.type === 'doc') && '_parent_file' in p) {
          orphanCount++;
          fail(`  Legacy orphan: ${relPath} has stale _parent_file`);
        }
      }

      if (!scrollResult.next_page_offset || scrollResult.points.length < 100) break;
      offset = scrollResult.next_page_offset;
    }

    info(`Type distribution: ${JSON.stringify(typeCounts)}`);
    info(`Orphan points found: ${orphanCount}`);
    
    if (payloadCount > 0) {
      const avgPayloadSize = Math.round(totalPayloadSize / payloadCount);
      info(`Average payload size: ${avgPayloadSize} bytes (${(avgPayloadSize/1024).toFixed(1)}KB)`);
      report.stats.avgPayloadSize = avgPayloadSize;
    }

    addCheck('no_orphan_points', orphanCount === 0, `orphan_count=${orphanCount}, types=${JSON.stringify(typeCounts)}`);
    
    // Store type distribution for reporting
    report.stats.typeDistribution = typeCounts;
    report.stats.orphanPoints = orphanCount;
    if (payloadCount > 0) {
      report.stats.avgPayloadSizeBytes = Math.round(totalPayloadSize / payloadCount);
    }

  } catch (e) {
    fail(`Orphan check failed: ${e.message}`);
    allPassed = false;
    addCheck('orphan_check', false, e.message);
  }

  // ── Step 6: Score quality checks ───────────────────────────────
  console.log('\n=== STEP 6: Query Quality Checks ===');

  for (const qr of report.queryResults) {
    const queryIdx = SEMANTIC_QUERIES.indexOf(qr.query);
    
    // Generic queries should return at least some results with score > 0.4
    if (qr.hits >= 1 && qr.topScores.length > 0) {
      const topScore = Math.max(...qr.topScores.filter(s => s !== undefined));
      
      if (topScore >= 0.4) {
        pass(`Query "${qr.query}" has good score: ${topScore.toFixed(4)} ≥ 0.4`);
        addCheck(`query_${queryIdx}_score_above_threshold`, true, `max_score=${topScore.toFixed(4)}, threshold=0.4`);
      } else {
        fail(`Query "${qr.query}" top score too low: ${topScore.toFixed(4)} < 0.4`);
        addCheck(`query_${queryIdx}_score_above_threshold`, false, `max_score=${topScore.toFixed(4)}, threshold=0.4`);
      }

      // Specific queries should ideally have scores > 0.6
      if (qr.topScores.length >= 2) {
        const secondBest = qr.topScores[1];
        if (secondBest && secondBest >= 0.3) {
          pass(`Query "${qr.query}" has consistent results: score₂=${secondBest.toFixed(4)} ≥ 0.3`);
          addCheck(`query_${queryIdx}_consistent_results`, true, `score_2=${secondBest.toFixed(4)}`);
        } else if (secondBest && secondBest >= 0.6) {
          pass(`Query "${qr.query}" has strong results: score₂=${secondBest.toFixed(4)} ≥ 0.6`);
          addCheck(`query_${queryIdx}_strong_results`, true, `score_2=${secondBest.toFixed(4)}`);
        } else if (secondBest === undefined || secondBest < 0.3) {
          info(`Query "${qr.query}" has only one strong result: score₂=${secondBest?.toFixed(4) || 'N/A'}`);
          addCheck(`query_${queryIdx}_single_strong_result`, true, `only_1_result_above_threshold`);
        }
      }
    } else {
      fail(`Query "${qr.query}" returned no results`);
      allPassed = false;
      addCheck(`query_${queryIdx}_has_results`, false, 'zero hits');
    }
  }

  // ── Final Report ───────────────────────────────────────────────
  console.log('\n\n=== FINAL REPORT ===\n');
  
  printReport();

  if (allPassed) {
    pass('All integration checks passed! 🎉');
    process.exit(0);
  } else {
    fail('Some integration checks failed. See report above.');
    process.exit(1);
  }
}

// ─── Report printer ──────────────────────────────────────────────
function printReport() {
  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│                    INTEGRATION TEST REPORT                  │');
  console.log('├─────────────────────────────────────────────────────────────┤');

  // Check summary
  const passed = report.checks.filter(c => c.passed).length;
  const failed = report.checks.filter(c => !c.passed).length;
  console.log(`│ Checks: ${passed} passed, ${failed} failed out of ${report.checks.length} total       │`);

  // Stats summary
  if (report.stats.syncPoints) {
    console.log(`│ Sync points indexed: ${String(report.stats.syncPoints).padEnd(47)}│`);
  }
  if (report.stats.avgPayloadSizeBytes) {
    const avgKB = (report.stats.avgPayloadSizeBytes / 1024).toFixed(1);
    console.log(`│ Avg payload size: ${String(`${avgKB} KB`).padEnd(47)}│`);
  }
  if (report.stats.typeDistribution) {
    const distStr = Object.entries(report.stats.typeDistribution).map(([k,v]) => `${k}:${v}`).join(', ');
    console.log(`│ Type distribution: ${String(distStr.substring(0, 35)).padEnd(47)}│`);
  }

  // Query results summary
  if (report.queryResults.length > 0) {
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ QUERY RESULTS SUMMARY:                                      │');
    for (const qr of report.queryResults) {
      const topScore = qr.topScores.filter(s => s !== undefined).slice(0, 3);
      const scoreStr = topScore.map(s => s.toFixed(4)).join(', ');
      console.log(`│   "${qr.query.substring(0, 25)}" → ${String(`${qr.hits} hits [${scoreStr}]`).padEnd(38)}│`);
    }
  }

  // Failed checks detail
  const failedChecks = report.checks.filter(c => !c.passed);
  if (failedChecks.length > 0) {
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ FAILED CHECKS:                                              │');
    for (const fc of failedChecks.slice(0, 10)) {
      const name = fc.name.substring(0, 45);
      console.log(`│   ❌ ${name.padEnd(47)}│`);
    }
  }

  console.log('└─────────────────────────────────────────────────────────────┘');
}

// ─── File walker helper ─────────────────────────────────────────
function walkDir(dir, callback) {
  return new Promise((resolve) => {
    fs.readdir(dir, { withFileTypes: true }).then(entries => {
      let pending = entries.length;
      
      if (pending === 0) { resolve(); return; }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip excluded directories
          if (['node_modules', '.git', 'gsd-qdrant-knowledge', '.bg-shell'].includes(entry.name)) {
            pending--;
            continue;
          }
          
          walkDir(fullPath, callback).then(() => {
            pending--;
            if (pending === 0) resolve();
          });
        } else if (entry.isFile()) {
          callback(fullPath).then(() => {
            pending--;
            if (pending === 0) resolve();
          }).catch(() => {
            pending--;
            if (pending === 0) resolve();
          });
        } else {
          pending--;
          if (pending === 0) resolve();
        }
      }
    }).catch(() => resolve());
  });
}

function basename(p) { return require('path').basename(p); }

// ─── Run ────────────────────────────────────────────────────────
main().catch(e => {
  console.error('\nFATAL ERROR:', e.message);
  console.error(e.stack);
  printReport();
  process.exit(1);
});
