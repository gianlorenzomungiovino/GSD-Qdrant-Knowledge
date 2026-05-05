/**
 * End-to-end retrieval test for GSD + Qdrant Knowledge.
 * Tests the full flow: intent detection → embedding → search → re-ranking → output.
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const path = require('path');

// Load modules from parent project directory
const PROJECT_ROOT = path.resolve(__dirname, '..');
const templatePath = path.join(PROJECT_ROOT, 'src', 'gsd-qdrant-template.js');
const intentDetector = require(path.join(PROJECT_ROOT, 'src', 'intent-detector'));
const { applyRecencyBoost, applySymbolBoost } = require('../src/re-ranking');

async function test() {
  const client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
  
  // Step 1: Check collection info
  console.log('=== STEP 1: Collection Info ===');
  try {
    const collInfo = await client.getCollection(process.env.COLLECTION_NAME || 'gsd_memory');
    console.log(`Collection: ${collInfo.name}`);
    console.log(`Points: ${collInfo.points_count || '(unknown)'}`);
    console.log(`Vectors: ${(collInfo.config?.params?.vectors) ? Object.keys(collInfo.config.params.vectors).join(', ') : 'none'}`);
  } catch (e) {
    console.error('❌ Cannot read collection info:', e.message);
    process.exit(1);
  }

  // Step 2: Sample some points to understand data structure
  console.log('\n=== STEP 2: Sample Points ===');
  try {
    const scrollResult = await client.scroll(
      process.env.COLLECTION_NAME || 'gsd_memory',
      { limit: 10, with_payload: true, with_vector: false }
    );
    
    console.log(`Scrolled ${scrollResult.points.length} points`);
    
    // Group by project_id
    const projects = new Map();
    for (const p of scrollResult.points) {
      const pid = p.payload?.project_id || 'unknown';
      if (!projects.has(pid)) projects.set(pid, 0);
      projects.set(pid, projects.get(pid) + 1);
      
      // Print first point's full payload structure
      if (p === scrollResult.points[0]) {
        console.log('\nFirst point payload keys:', Object.keys(p.payload || {}));
        console.log('Full payload:');
        const show = {};
        for (const [k, v] of Object.entries(p.payload || {})) {
          if (typeof v === 'string' && v.length > 200) {
            show[k] = v.substring(0, 200) + '...';
          } else {
            show[k] = v;
          }
        }
        console.log(JSON.stringify(show, null, 2));
      }
    }
    
    console.log('\nProjects indexed:');
    for (const [pid, count] of projects) {
      console.log(`  ${pid}: ${count} points`);
    }
  } catch (e) {
    console.error('❌ Scroll failed:', e.message);
    process.exit(1);
  }

  // Step 3: Test intent detection on sample queries
  console.log('\n=== STEP 3: Intent Detection ===');
  const testQueries = [
    'Come si usa il sistema di chunking in GSD?',
    'Show me the re-ranking implementation',
    'How to configure Qdrant MCP server',
    'GSD slice completion pattern'
  ];

  for (const q of testQueries) {
    const intent = intentDetector.detectIntent(q);
    console.log(`\nQuery: "${q}"`);
    console.log(`  searchType: ${intent.searchType}`);
    console.log(`  filters.type: ${intent.filters.type || '(none)'}`);
    console.log(`  filters.project_id: ${intent.filters.project_id || '(none)'}`);
    console.log(`  filters.tags: ${(intent.filters.tags||[]).join(', ') || '(none)'}`);
    
    const filter = intentDetector.buildQdrantFilter(intent);
    if (filter) {
      console.log(`  Qdrant filter: ${JSON.stringify(filter, null, 4)}`);
    } else {
      console.log('  Qdrant filter: none');
    }
    
    const keywords = intentDetector.extractKeywords(q);
    console.log(`  extractKeywords: "${keywords}"`);
  }

  // Step 4: Test embedding + search with a real query
  console.log('\n=== STEP 4: Embedding + Search ===');
  
  try {
    const template = require(templatePath);
    
    // We need to initialize the sync class which loads the transformer pipeline.
    // This may take time on first run (model download).
    const sync = new template.GSDKnowledgeSync();
    await sync.init();
    
    console.log('Embedding model loaded:', sync.vectorName || 'unknown');

    // Test queries for retrieval
    const searchQueries = [
      'chunking file content overlapping',
      're-ranking recency boost symbol names',
      'intent detector filter type mapping'
    ];

    for (const query of searchQueries) {
      console.log(`\n--- Search: "${query}" ---`);
      
      // Detect intent and build filter
      const intent = intentDetector.detectIntent(query);
      const qdrantFilter = intentDetector.buildQdrantFilter(intent);
      if (qdrantFilter) {
        console.log('  Filter:', JSON.stringify(qdrantFilter));
      } else {
        console.log('  Filter: none');
      }

      // Extract keywords for embedding
      const embeddedQuery = intentDetector.extractKeywords(query) || query;
      console.log(`  Embedded as: "${embeddedQuery}"`);

      // Generate vector
      const t0 = Date.now();
      const vector = await sync.embedText(embeddedQuery);
      console.log(`  Embedding time: ${Date.now() - t0}ms, dim: ${vector.length}`);

      // Search with group_by
      try {
        const groupedResults = await client.searchPointGroups(
          process.env.COLLECTION_NAME || 'gsd_memory',
          {
            vector: { name: sync.vectorName, vector },
            group_by: 'source',
            group_size: 2,
            limit: 15,
            score_threshold: 0.75,
            with_payload: true,
            with_vector: false,
          }
        );

        console.log(`  Groups found: ${groupedResults.groups.length}`);
        
        // Flatten and show top results per group
        let allHits = [];
        for (const g of groupedResults.groups) {
          allHits.push(...g.hits.map(h => ({ ...h, groupId: g.id })));
        }

        if (allHits.length === 0) {
          console.log('  ⚠️ No results above threshold');
          
          // Retry without threshold
          console.log('  Retrying without score_threshold...');
          const noThreshold = await client.searchPointGroups(
            process.env.COLLECTION_NAME || 'gsd_memory',
            {
              vector: { name: sync.vectorName, vector },
              group_by: 'source',
              group_size: 2,
              limit: 15,
              with_payload: true,
              with_vector: false,
            }
          );
          
          console.log(`  Groups (no threshold): ${noThreshold.groups.length}`);
          allHits = [];
          for (const g of noThreshold.groups) {
            allHits.push(...g.hits.map(h => ({ ...h, groupId: g.id })));
          }
        }

        // Apply re-ranking
        let rankedResults = allHits.map(hit => ({
          ...hit.payload,
          score: hit.score,
          _query: query
        }));

        applyRecencyBoost(rankedResults);
        applySymbolBoost(rankedResults, query);

        const sorted = rankedResults.sort((a, b) => b.score - a.score).slice(0, 5);

        console.log(`\n  Top ${sorted.length} results:`);
        for (let i = 0; i < Math.min(sorted.length, 5); i++) {
          const r = sorted[i];
          console.log(`    #${i+1} score=${r.score?.toFixed(4)} project="${r.project_id}" source="${r.source || '(none)'}"`);
          if (r.content && typeof r.content === 'string') {
            const preview = r.content.substring(0, 150).replace(/\n/g, '\\n');
            console.log(`       "${preview}..."`);
          }
        }

      } catch (searchErr) {
        // Fallback to plain search
        console.warn('  searchPointGroups failed, trying fallback...');
        try {
          const rawHits = await client.search(
            process.env.COLLECTION_NAME || 'gsd_memory',
            {
              vector: { name: sync.vectorName, vector },
              limit: 20,
              score_threshold: 0.75,
              with_payload: true,
              with_vector: false,
            }
          );

          console.log(`  Raw hits (threshold): ${rawHits.length}`);
          
          if (rawHits.length === 0) {
            const rawNoThreshold = await client.search(
              process.env.COLLECTION_NAME || 'gsd_memory',
              {
                vector: { name: sync.vectorName, vector },
                limit: 20,
                with_payload: true,
                with_vector: false,
              }
            );
            console.log(`  Raw hits (no threshold): ${rawNoThreshold.length}`);
            
            let rankedResults = rawNoThreshold.map(hit => ({
              ...hit.payload,
              score: hit.score,
              _query: query
            }));

            applyRecencyBoost(rankedResults);
            applySymbolBoost(rankedResults, query);

            const sorted = rankedResults.sort((a, b) => b.score - a.score).slice(0, 5);
            
            console.log(`\n  Top ${sorted.length} results:`);
            for (let i = 0; i < Math.min(sorted.length, 5); i++) {
              const r = sorted[i];
              console.log(`    #${i+1} score=${r.score?.toFixed(4)} project="${r.project_id}" source="${r.source || '(none)'}"`);
            }
          } else {
            let rankedResults = rawHits.map(hit => ({
              ...hit.payload,
              score: hit.score,
              _query: query
            }));

            applyRecencyBoost(rankedResults);
            applySymbolBoost(rankedResults, query);

            const sorted = rankedResults.sort((a, b) => b.score - a.score).slice(0, 5);
            
            console.log(`\n  Top ${sorted.length} results:`);
            for (let i = 0; i < Math.min(sorted.length, 5); i++) {
              const r = sorted[i];
              console.log(`    #${i+1} score=${r.score?.toFixed(4)} project="${r.project_id}" source="${r.source || '(none)'}"`);
            }
          }

        } catch (fallbackErr) {
          console.error('  ❌ Search failed:', fallbackErr.message);
        }
      }
    }

  } catch (e) {
    console.error('❌ Embedding/Search test failed:', e.message);
    console.error(e.stack);
  }

  // Step 5: Test CLI context command end-to-end
  console.log('\n=== STEP 5: CLI Context Command ===');
  const { spawnSync } = require('child_process');
  
  for (const query of ['chunking overlapping', 're-ranking symbol boost']) {
    console.log(`\n--- CLI Query: "${query}" ---`);
    try {
      // Set env vars to match MCP config
      const result = spawnSync(
        process.env.QDRANT_URL ? 'node' : 'node',
        ['src/cli.js', 'context', query],
        { 
          cwd: PROJECT_ROOT,
          env: { ...process.env, QDRANT_URL: 'http://localhost:6333', COLLECTION_NAME: 'gsd_memory', VECTOR_NAME: 'codebert-768' },
          timeout: 120000,
          encoding: 'utf8'
        }
      );

      if (result.stdout) {
        // Show only the JSON output at end and key log lines
        const lines = result.stdout.split('\n');
        for (const line of lines) {
          if (line.startsWith('[qdrant]') || line.startsWith('[retrieval]')) {
            console.log(line);
          } else if (line.trim().startsWith('{')) {
            try {
              const json = JSON.parse(line);
              console.log(`  Results: ${json.results?.length || 0} items`);
              if (json.results && json.results.length > 0) {
                for (let i = 0; i < Math.min(json.results.length, 3); i++) {
                  const r = json.results[i];
                  console.log(`    #${i+1}: score=${r.score?.toFixed(4)} project="${r.project_id}" source="${r.source || '(none)'}"`);
                }
              }
            } catch (_) {}
          }
        }
      }

      if (result.stderr && result.stderr.length > 0) {
        console.log('  stderr:', result.stderr.toString().trim());
      }

    } catch (e) {
      console.error(`  ❌ CLI test failed: ${e.message}`);
    }
  }

  console.log('\n=== TEST COMPLETE ===');
}

test().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
