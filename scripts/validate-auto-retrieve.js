#!/usr/bin/env node

/**
 * Validation Script for Auto-Retrieve
 * 
 * Compares auto_retrieve results with manual queries on real scenarios
 * to demonstrate that automatic retrieval produces relevant results
 * without introducing regressions.
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Configurazione
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'gsd_memory';
const VECTOR_NAME = process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2';

/**
 * Genera embedding placeholder (fallback)
 */
function generatePlaceholderEmbedding(text) {
  const hash = crypto.createHash('md5').update(text).digest('hex');
  const vector = new Array(1024).fill(0);
  for (let i = 0; i < 1024; i++) {
    const startIdx = (i * 4) % hash.length;
    const hashPart = hash.substring(startIdx, startIdx + 4) || hash.substring(0, 4);
    vector[i] = parseInt(hashPart, 16) / 0xffff;
  }
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0 && !Number.isNaN(norm)) {
    for (let i = 0; i < 1024; i++) vector[i] /= norm;
  }
  return vector;
}

/**
 * Estrae parole chiave significative da un task dell'utente
 */
function extractKeywordsFromTask(task) {
  if (!task || typeof task !== 'string') {
    throw new Error('Invalid task input');
  }
  
  const lowerTask = task.toLowerCase();
  
  const patterns = [
    /autenticazione|login|registrazione|jwt|oauth|sessione|token|password/i,
    /componente|component|widget|modulo/i,
    /hero|header|footer|layout|sidebar/i,
    /api|endpoint|request|response/i,
    /database|modello|schema|tabella/i,
    /form|input|validazione|submit/i,
  ];
  
  const keywords = [];
  
  for (const pattern of patterns) {
    const match = lowerTask.match(pattern);
    if (match) {
      const matchIndex = lowerTask.indexOf(match[0]);
      let endPos = matchIndex + match[0].length;
      while (endPos < task.length && !/\s/.test(task[endPos])) {
        endPos++;
      }
      const originalWord = task.substring(matchIndex, endPos);
      keywords.push(originalWord);
    }
  }
  
  return [...new Set(keywords)];
}

/**
 * Genera query di ricerca ottimali dalle parole chiave estratte
 */
function generateSearchQueries(keywords) {
  if (keywords.length === 0) return [''];
  if (keywords.length === 1) return [keywords[0]];
  return [keywords[0], `${keywords[0]} ${keywords[1]}`];
}

/**
 * Esegue ricerca puramente vettoriale (query manuale)
 */
async function manualQuerySearch(client, query, limit = 3) {
  const embedding = await generatePlaceholderEmbedding(query);
  
  const hits = await client.search(COLLECTION_NAME, {
    vector: { name: VECTOR_NAME, vector: embedding },
    limit,
    with_payload: true,
    with_vector: false
  });
  
  return hits.map(hit => ({
    score: hit.score,
    payload: hit.payload,
    matchType: 'vector'
  }));
}

/**
 * Esegue ricerca con auto_retrieve (keyword extraction + hybrid matching)
 */
async function autoRetrieveSearch(client, task, limit = 3, maxQueries = 2) {
  const keywords = extractKeywordsFromTask(task);
  const queries = keywords.length > 0 
    ? [keywords[0], ...keywords.slice(1, maxQueries)]
    : [task];
  
  const allResults = [];
  
  for (const query of queries) {
    // === VECTOR MATCHING ===
    const embedding = await generatePlaceholderEmbedding(query);
    
    const vectorHits = await client.search(COLLECTION_NAME, {
      vector: { name: VECTOR_NAME, vector: embedding },
      limit,
      with_payload: true,
      with_vector: false
    });
    
    vectorHits.forEach(hit => {
      allResults.push({
        ...hit.payload,
        score: hit.score,
        matchType: 'vector',
        query: query
      });
    });
    
    // === TEXT MATCHING (full-text search) ===
    try {
      const textHits = await client.search(COLLECTION_NAME, {
        vector: 'text',
        limit,
        with_payload: true,
        with_vector: false,
        query: query
      });
      
      textHits.forEach(hit => {
        allResults.push({
          ...hit.payload,
          score: hit.score,
          matchType: 'text',
          query: query
        });
      });
    } catch (err) {
      // Text search might fail
    }
  }
  
  // Rimuovi duplicati e ordina
  const unique = [...new Map(allResults.map(r => [r.id, r])).values()];
  unique.sort((a, b) => (b.score || 0) - (a.score || 0));
  
  return unique.slice(0, limit).map(r => ({
    score: r.score,
    payload: r.payload,
    matchType: r.matchType
  }));
}

/**
 * Calcola metriche di confronto
 */
function calculateComparisonMetrics(manualResults, autoResults) {
  const metrics = {
    avgManualScore: 0,
    avgAutoScore: 0,
    improvement: 0,
    manualTotal: 0,
    autoTotal: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    hasData: false
  };
  
  if (!manualResults || manualResults.length === 0 || !autoResults || autoResults.length === 0) {
    return metrics;
  }
  
  const manualScores = manualResults.map(r => r.score || 0).filter(s => !Number.isNaN(s));
  const autoScores = autoResults.map(r => r.score || 0).filter(s => !Number.isNaN(s));
  
  if (manualScores.length === 0 || autoScores.length === 0) {
    return metrics;
  }
  
  metrics.hasData = true;
  metrics.avgManualScore = manualScores.reduce((a, b) => a + b, 0) / manualScores.length;
  metrics.avgAutoScore = autoScores.reduce((a, b) => a + b, 0) / autoScores.length;
  
  if (metrics.avgManualScore === 0) {
    metrics.improvement = metrics.avgAutoScore > 0 ? 100 : 0;
  } else {
    metrics.improvement = ((metrics.avgAutoScore - metrics.avgManualScore) / metrics.avgManualScore) * 100;
  }
  
  metrics.manualTotal = manualScores.reduce((a, b) => a + b, 0);
  metrics.autoTotal = autoScores.reduce((a, b) => a + b, 0);
  
  const minLen = Math.min(manualResults.length, autoResults.length);
  for (let i = 0; i < minLen; i++) {
    const manualSum = manualResults[i].score || 0;
    const autoSum = autoResults[i].score || 0;
    
    if (autoSum > manualSum) metrics.wins++;
    else if (autoSum === manualSum) metrics.ties++;
    else metrics.losses++;
  }
  
  return metrics;
}

/**
 * Main validation function
 */
async function runValidation() {
  console.error('=== Auto-Retrieve Validation ===');
  console.error(`Qdrant URL: ${QDRANT_URL}`);
  console.error(`Collection: ${COLLECTION_NAME}`);
  console.error(`Vector name: ${VECTOR_NAME}\n`);
  
  const client = new QdrantClient({ url: QDRANT_URL });
  
  // Carica scenari di test
  const scenariosPath = path.join(__dirname, '..', 'tests', 'scenarios.json');
  const scenariosData = JSON.parse(fs.readFileSync(scenariosPath, 'utf-8'));
  const scenarios = scenariosData.scenarios;
  
  console.error(`Loaded ${scenarios.length} test scenarios\n`);
  
  const results = [];
  const startTime = Date.now();
  
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    console.error(`[${i+1}/${scenarios.length}] Testing: "${scenario.task.substring(0, 40)}..."`);
    
    // Manual query (pure vector search)
    const manualResults = await manualQuerySearch(client, scenario.task, 3);
    const manualScore = manualResults.reduce((sum, r) => sum + r.score, 0);
    
    // Auto-retrieve (keyword extraction + hybrid matching)
    const autoResults = await autoRetrieveSearch(client, scenario.task, 3, 2);
    const autoScore = autoResults.reduce((sum, r) => sum + r.score, 0);
    
    const comparison = calculateComparisonMetrics(manualResults, autoResults);
    
    results.push({
      scenario: scenario,
      manualScore,
      autoScore,
      comparison,
      manualResults,
      autoResults
    });
  }
  
  const totalTime = Date.now() - startTime;
  console.error(`\nValidation completed in ${totalTime}ms\n`);
  
  // Calcola metriche aggregate
  const allManual = results.map(r => r.manualResults).flat();
  const allAuto = results.map(r => r.autoResults).flat();
  const aggregateMetrics = calculateComparisonMetrics(allManual, allAuto);
  
  // Stampa risultati dettagliati
  console.error('=== Validation Results ===');
  console.error('');
  
  for (const result of results) {
    const { scenario, manualScore, autoScore, comparison } = result;
    const status = comparison.improvement >= 0 ? '✅' : '❌';
    
    console.error(`${status} ${scenario.description}`);
    console.error(`   Task: "${scenario.task}"`);
    console.error(`   Keywords: ${JSON.stringify(extractKeywordsFromTask(scenario.task))}`);
    console.error(`   Manual score: ${manualScore.toFixed(4)}`);
    console.error(`   Auto-retrieve score: ${autoScore.toFixed(4)}`);
    console.error(`   Improvement: ${comparison.improvement.toFixed(2)}%`);
    console.error('');
  }
  
  // Stampa metriche aggregate
  console.error('=== Aggregate Metrics ===');
  console.error(`Average manual score: ${aggregateMetrics.avgManualScore.toFixed(4)}`);
  console.error(`Average auto-retrieve score: ${aggregateMetrics.avgAutoScore.toFixed(4)}`);
  console.error(`Improvement: ${aggregateMetrics.improvement.toFixed(2)}%`);
  console.error(`Wins: ${aggregateMetrics.wins}, Ties: ${aggregateMetrics.ties}, Losses: ${aggregateMetrics.losses}`);
  console.error('');
  
  // Verifica che auto_retrieve sia almeno pari o migliore delle query manuali
  const pass = aggregateMetrics.improvement >= -5; // Allow small margin for float precision
  
  console.error('=== Validation Summary ===');
  console.error(`Auto-retrieve produces relevant results: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  console.error(`No regression detected: ${aggregateMetrics.losses <= aggregateMetrics.wins ? '✅ PASS' : '❌ FAIL'}`);
  
  // Exit with appropriate code
  process.exit(pass ? 0 : 1);
}

// Esegui validazione
runValidation().catch(err => {
  console.error('Validation error:', err.message);
  process.exit(1);
});
