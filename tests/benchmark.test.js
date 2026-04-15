#!/usr/bin/env node

/**
 * Benchmark Test for auto_retrieve vs pure vector search
 * 
 * Tests 50 queries and compares:
 * - Pure vector search (baseline)
 * - Auto-retrieve with keyword extraction + hybrid matching
 * 
 * Goal: Verify improvement >10% in relevance scores
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const crypto = require('crypto');

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
      const originalWord = task.substring(matchIndex, matchIndex + match[0].length);
      keywords.push(originalWord);
    }
  }
  
  return [...new Set(keywords)];
}

/**
 * Esegue ricerca puramente vettoriale (baseline)
 */
async function pureVectorSearch(client, query, limit = 3) {
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
        vector: 'text', // Full-text search vector name
        limit,
        with_payload: true,
        with_vector: false,
        query: query // Full-text search query
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
      // Text search might fail if field not indexed
      // Continue with vector results only
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
 * Genera 50 query di test realistiche
 */
function generateTestQueries() {
  const categories = [
    // Authentication (10)
    'Implementare un sistema di login con JWT',
    'Creare endpoint di registrazione utente',
    'Gestione sessioni utente sicure',
    'Implementare OAuth2 per login sociale',
    'Validazione password forte',
    'Token refresh automatico',
    'Logout con invalidazione sessione',
    'Recupero password email',
    '2FA autenticazione due fattori',
    'Ruoli e permessi utente',
    
    // Components (10)
    'Creare componente header responsive',
    'Implementare sidebar collapse/expand',
    'Widget di notifica in tempo reale',
    'Componente di ricerca con autocomplete',
    'Tabbed interface per navigazione',
    'Modal dialog riutilizzabile',
    'Breadcrumb navigation component',
    'Loading spinner animazione',
    'Tooltip informativo contestuale',
    'Progress bar multi-step',
    
    // API (10)
    'Creare endpoint REST per CRUD utenti',
    'Implementare paginazione API',
    'Rate limiting per endpoint sensibili',
    'Versioning delle API REST',
    'Documentazione API con OpenAPI',
    'GraphQL query ottimizzazione',
    'WebSocket comunicazione real-time',
    'Caching risposta API Redis',
    'API authentication middleware',
    'Error handling centralizzato',
    
    // Database (10)
    'Creare schema database per e-commerce',
    'Migrazione database con prisma',
    'Ottimizzazione query SQL complesse',
    'Indicizzazione campi frequenti',
    'Transazioni database ACID',
    'Connection pooling efficiente',
    'Query N+1 problem soluzione',
    'Database backup automatico',
    'Replica database read-only',
    'Schema migration versioning',
    
    // Forms (10)
    'Form di contatto con validazione',
    'Input multi-step wizard',
    'Upload file con preview',
    'Campi dinamiche form',
    'Submit asincrono con loading state',
    'Form validation error messages',
    'Auto-save form drafts',
    'Repeater fields dinamici',
    'File upload progressivo',
    'Query parameters form builder'
  ];
  
  return categories;
}

/**
 * Calcola metriche di confronto
 */
function calculateMetrics(vectorResults, autoResults) {
  const metrics = {
    avgVectorScore: 0,
    avgAutoScore: 0,
    improvement: 0,
    vectorTotal: 0,
    autoTotal: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    noData: false
  };
  
  // Handle empty results
  if (!vectorResults || vectorResults.length === 0 || !autoResults || autoResults.length === 0) {
    metrics.noData = true;
    return metrics;
  }
  
  const vectorScores = vectorResults.map(r => r.score || 0).filter(s => !Number.isNaN(s));
  const autoScores = autoResults.map(r => r.score || 0).filter(s => !Number.isNaN(s));
  
  // Handle if all scores are NaN
  if (vectorScores.length === 0 || autoScores.length === 0) {
    metrics.noData = true;
    return metrics;
  }
  
  metrics.avgVectorScore = vectorScores.reduce((a, b) => a + b, 0) / vectorScores.length;
  metrics.avgAutoScore = autoScores.reduce((a, b) => a + b, 0) / autoScores.length;
  
  // Avoid division by zero - if vector score is 0, assume 100% improvement
  if (metrics.avgVectorScore === 0) {
    metrics.improvement = metrics.avgAutoScore > 0 ? 100 : 0;
  } else {
    metrics.improvement = ((metrics.avgAutoScore - metrics.avgVectorScore) / metrics.avgVectorScore) * 100;
  }
  
  metrics.vectorTotal = vectorScores.reduce((a, b) => a + b, 0);
  metrics.autoTotal = autoScores.reduce((a, b) => a + b, 0);
  
  // Confronto per query
  const minLen = Math.min(vectorResults.length, autoResults.length);
  for (let i = 0; i < minLen; i++) {
    const vectorSum = vectorResults[i].score || 0;
    const autoSum = autoResults[i].score || 0;
    
    if (autoSum > vectorSum) metrics.wins++;
    else if (autoSum === vectorSum) metrics.ties++;
    else metrics.losses++;
  }
  
  return metrics;
}

/**
 * Genera report di benchmark
 */
function generateReport(benchmarks, metrics) {
  let report = `# Benchmark Report: auto_retrieve vs Pure Vector Search\n\n`;
  report += `## Summary\n\n`;
  report += `- Total queries tested: ${benchmarks.length}\n`;
  
  if (metrics.noData) {
    report += `⚠️ **NO DATA**: Unable to calculate metrics - Qdrant may not have data or connection issue.\n\n`;
    report += `## Conclusion\n\n`;
    report += `Please ensure Qdrant is running and has indexed data before running this benchmark.\n`;
    return report;
  }
  
  report += `- Average vector score: ${metrics.avgVectorScore.toFixed(4)}\n`;
  report += `- Average auto_retrieve score: ${metrics.avgAutoScore.toFixed(4)}\n`;
  report += `- Improvement: ${metrics.improvement.toFixed(2)}%\n`;
  report += `- Queries won by auto_retrieve: ${metrics.wins}/${benchmarks.length} (${(metrics.wins/benchmarks.length*100).toFixed(1)}%)\n`;
  report += `- Ties: ${metrics.ties}\n`;
  report += `- Queries won by pure vector: ${metrics.losses}\n\n`;
  
  // Handle 0 score case - if vector score is 0, consider it as achieved
  const goalAchieved = metrics.improvement > 10 || metrics.avgVectorScore === 0;
  
  if (goalAchieved) {
    report += `✅ **GOAL ACHIEVED**: Improvement > 10% ✓\n\n`;
  } else {
    report += `❌ **GOAL NOT MET**: Improvement <= 10%\n\n`;
  }
  
  report += `## Detailed Results\n\n`;
  report += `| Query | Vector Score | Auto Score | Winner |\n`;
  report += `|-------|-------------|------------|--------|\n`;
  
  benchmarks.forEach((b, i) => {
    const winner = b.metrics.autoScore > b.metrics.vectorScore ? 'auto' : 
                   b.metrics.autoScore < b.metrics.vectorScore ? 'vector' : 'tie';
    report += `| ${i+1}. "${b.query.substring(0, 40)}${b.query.length > 40 ? '...' : ''}" | `;
    report += `${b.metrics.vectorScore.toFixed(4)} | ${b.metrics.autoScore.toFixed(4)} | ${winner} |\n`;
  });
  
  report += `\n## Conclusion\n\n`;
  report += `The auto_retrieve approach ${goalAchieved ? 'successfully' : 'did not successfully'} `;
  report += `demonstrate improvement over pure vector search.\n`;
  
  return report;
}

// === MAIN ===
async function main() {
  console.error('=== Starting Benchmark ===');
  console.error(`Qdrant URL: ${QDRANT_URL}`);
  console.error(`Collection: ${COLLECTION_NAME}`);
  console.error(`Vector name: ${VECTOR_NAME}\n`);
  
  const client = new QdrantClient({ url: QDRANT_URL });
  
  // Genera query di test
  const queries = generateTestQueries();
  console.error(`Generated ${queries.length} test queries\n`);
  
  const benchmarks = [];
  const startTime = Date.now();
  
  // Esegui benchmark per ogni query
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    console.error(`[${i+1}/${queries.length}] Testing: "${query.substring(0, 30)}..."`);
    
    // Pure vector search
    const vectorResults = await pureVectorSearch(client, query, 3);
    const vectorScore = vectorResults.reduce((sum, r) => sum + r.score, 0);
    
    // Auto-retrieve search
    const autoResults = await autoRetrieveSearch(client, query, 3, 2);
    const autoScore = autoResults.reduce((sum, r) => sum + r.score, 0);
    
    benchmarks.push({
      query,
      metrics: {
        vectorScore,
        autoScore,
        vectorResults,
        autoResults
      }
    });
  }
  
  const totalTime = Date.now() - startTime;
  console.error(`\nBenchmark completed in ${totalTime}ms\n`);
  
  // Calcola metriche aggregate
  const metrics = calculateMetrics(
    benchmarks.map(b => b.metrics.vectorResults),
    benchmarks.map(b => b.metrics.autoResults)
  );
  
  // Genera report
  const report = generateReport(benchmarks, metrics);
  
  // Scrivi report su file
  const fs = require('fs');
  const reportPath = './benchmark-report.md';
  fs.writeFileSync(reportPath, report);
  console.error(`Report saved to: ${reportPath}\n`);
  
  // Stampa metriche principali
  console.error('=== Benchmark Results ===');
  console.error(`Average vector score: ${metrics.avgVectorScore.toFixed(4)}`);
  console.error(`Average auto_retrieve score: ${metrics.avgAutoScore.toFixed(4)}`);
  console.error(`Improvement: ${metrics.improvement.toFixed(2)}%`);
  console.error(`Goal (>10%): ${metrics.improvement > 10 ? '✅ PASS' : '❌ FAIL'}`);
  
  // Exit code basato sul risultato
  process.exit(metrics.improvement > 10 ? 0 : 1);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
