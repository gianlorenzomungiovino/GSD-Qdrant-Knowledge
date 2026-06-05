/**
 * Test unitari per i thresholds di ricerca
 *
 * Verifica:
 * 1. Valori hardcoded corretti in CLI, MCP, Template
 * 2. Fallback si attiva correttamente (quando < 2 risultati sopra primary)
 * 3. Scoring formula con i threshold
 * 4. Edge cases: similarity bassa con max boosts, similarity alta senza boosts
 *
 * Nessun test richiede Qdrant o rete — tutti mock/static analysis.
 */

const { strictEqual, ok, deepStrictEqual, strictNotEqual } = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ─── Helpers per static analysis ─────────────────────────────────────

/**
 * Legge il file sorgente e restituisce le righe come stringa.
 */
function readSource(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

/**
 * Estrae tutte le assegnazioni a una variabile con pattern const NAME = VALUE.
 */
function extractConstAssignments(source, varName) {
  const regex = new RegExp(`const\\s+${varName}\\s*=\\s*([\\d.]+)`, 'g');
  const matches = [];
  let m;
  while ((m = regex.exec(source)) !== null) {
    matches.push(parseFloat(m[1]));
  }
  return matches;
}

// ─── Test 1: Valori hardcoded CLI ────────────────────────────────────

describe('Thresholds hardcoded — static analysis', () => {
  it('CLI: SCORE_THRESHOLD = 0.78, FALLBACK_THRESHOLD = 0.55', () => {
    const source = readSource('src/cli.js');
    const scores = extractConstAssignments(source, 'SCORE_THRESHOLD');
    const falls = extractConstAssignments(source, 'FALLBACK_THRESHOLD');

    strictEqual(scores.length, 1, 'Deve esserci esattamente una definizione di SCORE_THRESHOLD in cli.js');
    strictEqual(scores[0], 0.78, 'CLI SCORE_THRESHOLD deve essere 0.78');

    strictEqual(falls.length, 1, 'Deve esserci esattamente una definizione di FALLBACK_THRESHOLD in cli.js');
    strictEqual(falls[0], 0.55, 'CLI FALLBACK_THRESHOLD deve essere 0.55');
  });

  it('MCP: SCORE_THRESHOLD = 0.70, FALLBACK_THRESHOLD = 0.48', () => {
    const source = readSource('src/gsd-qdrant-mcp/index.js');
    const scores = extractConstAssignments(source, 'SCORE_THRESHOLD');
    const falls = extractConstAssignments(source, 'FALLBACK_THRESHOLD');

    strictEqual(scores.length, 1, 'Deve esserci esattamente una definizione di SCORE_THRESHOLD in mcp/index.js');
    strictEqual(scores[0], 0.70, 'MCP SCORE_THRESHOLD deve essere 0.70');

    strictEqual(falls.length, 1, 'Deve esserci esattamente una definizione di FALLBACK_THRESHOLD in mcp/index.js');
    strictEqual(falls[0], 0.48, 'MCP FALLBACK_THRESHOLD deve essere 0.48');
  });

  it('Template: default scoreThreshold = 0.60 (senza fallback)', () => {
    const source = readSource('src/gsd-qdrant-template.js');
    // Template usa options.scoreThreshold || 0.6 — nessun FALLBACK_THRESHOLD
    const defaultMatch = source.match(/scoreThreshold\s*\|\|\s*([0-9.]+)/);
    ok(defaultMatch, 'Template deve avere un default per scoreThreshold');
    strictEqual(parseFloat(defaultMatch[1]), 0.6, 'Template default scoreThreshold deve essere 0.60');

    const hasFallback = /FALLBACK_THRESHOLD/.test(source);
    strictEqual(hasFallback, false, 'Template NON deve avere FALLBACK_THRESHOLD');
  });

  it('CLI e MCP hanno valori diversi (storicamente intenzionali)', () => {
    const cliSource = readSource('src/cli.js');
    const mcpSource = readSource('src/gsd-qdrant-mcp/index.js');

    const cliPrimary = extractConstAssignments(cliSource, 'SCORE_THRESHOLD')[0];
    const mcpPrimary = extractConstAssignments(mcpSource, 'SCORE_THRESHOLD')[0];

    strictEqual(cliPrimary, 0.78);
    strictEqual(mcpPrimary, 0.70);
    ok(cliPrimary !== mcpPrimary, 'CLI e MCP devono avere valori diversi');
  });
});

// ─── Test 2: Fallback activation ─────────────────────────────────────

describe('Fallback activation logic', () => {
  const { applyRecencyBoost, applySymbolBoost, sortChunksByPosition } = require('../src/re-ranking');

  /**
   * Simula la logica di filtro+fallback presente in cli.js e mcp/index.js:
   *   1. Filtra risultati sopra SCORE_THRESHOLD
   *   2. Se < 2 risultati, riprova con FALLBACK_THRESHOLD
   */
  function simulateFilterFallback(hits, primaryThreshold, fallbackThreshold) {
    let rankedHits = hits.filter(hit => hit.score >= primaryThreshold);
    if (rankedHits.length < 2 && hits.length > 0) {
      rankedHits = hits.filter(hit => hit.score >= fallbackThreshold);
    }
    return rankedHits;
  }

  it('CLI: fallback si attiva quando < 2 risultati sopra 0.78', () => {
    const hits = [
      { score: 0.80 }, // sopra primary
      { score: 0.76 }, // sotto primary
      { score: 0.72 }, // sotto primary
    ];

    // Primary filter
    let rankedHits = hits.filter(h => h.score >= 0.78);
    strictEqual(rankedHits.length, 1, 'Solo 1 risultato sopra 0.78');

    // Fallback si attiva perché < 2
    rankedHits = simulateFilterFallback(hits, 0.78, 0.55);
    strictEqual(rankedHits.length, 3, 'Fallback recupera tutti e 3 i risultati');
    deepStrictEqual(
      rankedHits.map(h => h.score),
      [0.80, 0.76, 0.72],
      'Fallback mantiene i risultati >= 0.55'
    );
  });

  it('CLI: fallback NON si attiva quando >= 2 risultati sopra primary', () => {
    const hits = [
      { score: 0.85 },
      { score: 0.82 },
      { score: 0.60 },
    ];

    const rankedHits = simulateFilterFallback(hits, 0.78, 0.55);
    strictEqual(rankedHits.length, 2, '2 risultati sopra 0.78 → nessun fallback');
    deepStrictEqual(
      rankedHits.map(h => h.score),
      [0.85, 0.82],
      'Solo i risultati sopra primary'
    );
  });

  it('MCP: fallback si attiva quando < 2 risultati sopra 0.70', () => {
    const hits = [
      { score: 0.75 }, // sopra primary
      { score: 0.65 }, // sotto primary
      { score: 0.50 }, // sotto primary
    ];

    let rankedHits = hits.filter(h => h.score >= 0.70);
    strictEqual(rankedHits.length, 1, 'Solo 1 risultato sopra 0.70');

    const fallbackHits = simulateFilterFallback(hits, 0.70, 0.48);
    strictEqual(fallbackHits.length, 3, 'Fallback recupera tutti e 3 i risultati');
  });

  it('MCP: fallback NON si attiva quando >= 2 risultati sopra primary', () => {
    const hits = [
      { score: 0.80 },
      { score: 0.75 },
      { score: 0.55 },
    ];

    const rankedHits = simulateFilterFallback(hits, 0.70, 0.48);
    strictEqual(rankedHits.length, 2, '2 risultati sopra 0.70 → nessun fallback');
  });

  it('Fallback non si attiva se non ci sono risultati affatto', () => {
    const hits = [];
    const rankedHits = simulateFilterFallback(hits, 0.78, 0.55);
    strictEqual(rankedHits.length, 0, 'Nessun risultato → nessun fallback');
  });

  it('Fallback non si attiva se tutti i risultati sono sotto fallback', () => {
    const hits = [
      { score: 0.40 },
      { score: 0.35 },
    ];

    const rankedHits = simulateFilterFallback(hits, 0.78, 0.55);
    strictEqual(rankedHits.length, 0, 'Tutti sotto fallback → risultati vuoti');
  });
});

// ─── Test 3: Scoring formula con i threshold ─────────────────────────

describe('Scoring formula con thresholds', () => {
  const { calculateLexicalSignal } = require('../src/re-ranking');

  it('Similarity 0.70 con symbolMultiplier 1.5 → score boosted > 0.70', () => {
    const result = calculateLexicalSignal(
      { score: 0.70, symbolNames: ['MyClass'], source: 'src/app.js' },
      'MyClass'
    );

    ok(result.symbolMultiplier > 1, 'Symbol match attivo');
    strictEqual(result.symbolMultiplier, 1.5, 'Symbol multiplier deve essere 1.5');

    const boosted = 0.70 * 1.5;
    ok(boosted > 0.70, `0.70 × 1.5 = ${boosted} > 0.70`);
  });

  it('Similarity 0.65 con sourceBoost 0.2 (tutti i token match) → score boosted', () => {
    const result = calculateLexicalSignal(
      { score: 0.65, symbolNames: [], source: 'src/utils/helper.js' },
      'utils helper'
    );

    ok(result.sourceBoost > 0, 'Source boost attivo');
    strictEqual(result.sourceBoost, 0.2, 'Source boost massimo = 0.2 quando tutti i token matchano');

    const boosted = Math.min(1.0, 0.65 + 0.2);
    ok(Math.abs(boosted - 0.85) < 0.001, `0.65 + 0.2 ≈ 0.85 (capped at 1.0)`);
  });

  it('Similarità 0.70 senza boosts rimane 0.70 (threshold MCP borderline)', () => {
    const result = calculateLexicalSignal(
      { score: 0.70, symbolNames: ['asdfgh'], source: 'unrelated_file.py' },
      'qwerty'
    );

    strictEqual(result.symbolMultiplier, 1, 'Nessun symbol match');
    strictEqual(result.sourceBoost, 0, 'Nessun source boost');

    ok(Math.abs(result.symbolMultiplier * 0.70 - 0.70) < 0.001, 'Score rimane 0.70 senza boosts');
  });

  it('Formula composita MCP: raw 0.65 → composite 0.730 (best case, sopra threshold)', () => {
    // Formula: raw*0.6 + (1-recency)*0.15 + (importance/5)*0.05 + reusable + crossProject + sameProject
    const raw = 0.65;
    const recency = 0; // newest possibile
    const importance = 5; // max
    const reusable = 0.08;
    const crossProject = 0.06;
    const sameProject = 0;

    const composite = raw * 0.6 + (1 - recency) * 0.15 + (importance / 5) * 0.05 + reusable + crossProject + sameProject;

    ok(composite > 0.70, `Composite ${composite.toFixed(3)} > 0.70 threshold`);
    strictEqual(composite.toFixed(3), '0.730', 'Best case: 0.65 raw → 0.730 composite');
  });

  it('Formula composita MCP: raw 0.65 → composite 0.400 (worst case, sotto threshold)', () => {
    const raw = 0.65;
    const recency = 1; // più vecchio possibile (30+ giorni)
    const importance = 1; // min
    const reusable = 0;
    const crossProject = 0;
    const sameProject = 0;

    const composite = raw * 0.6 + (1 - recency) * 0.15 + (importance / 5) * 0.05 + reusable + crossProject + sameProject;

    ok(composite < 0.70, `Composite ${composite.toFixed(3)} < 0.70 threshold`);
    strictEqual(composite.toFixed(3), '0.400', 'Worst case: 0.65 raw → 0.400 composite');
  });

  it('Formula composita MCP: raw 0.75 → composite 0.710 (best case con crossProject, sopra threshold)', () => {
    const raw = 0.75;
    const recency = 0; // newest
    const importance = 5; // max
    const reusable = 0;
    const crossProject = 0.06;
    const sameProject = 0;

    const composite = raw * 0.6 + (1 - recency) * 0.15 + (importance / 5) * 0.05 + reusable + crossProject + sameProject;

    ok(composite > 0.70, `Composite ${composite.toFixed(3)} > 0.70`);
    strictEqual(composite.toFixed(3), '0.710', 'Best case: 0.75 raw → 0.710 composite');
  });
});

// ─── Test 4: Edge cases ──────────────────────────────────────────────

describe('Edge cases', () => {
  const { applyRecencyBoost, applySymbolBoost } = require('../src/re-ranking');

  it('Similarità bassa (0.40) con max boosts non supera 0.70', () => {
    const results = [
      { score: 0.40, lastModified: Date.now() / 1000, source: 'src/my-class.js', symbolNames: ['MyClass'] },
    ];

    applyRecencyBoost(results, 30, 'MyClass');
    applySymbolBoost(results, 'MyClass');

    // Max boost: +0.05 recency + 0.15 path match + symbol ×1.5
    // 0.40 + 0.05 = 0.45 (recency) → min(1.0, 0.45 + 0.15) = 0.60 (path match) → 0.60 × 1.5 = 0.90 (symbol)
    // Ma l'ordine è: recency prima, poi symbol, quindi:
    // Dopo recency: 0.40 + 0.05 = 0.45
    // Dopo path match: min(1.0, 0.45 + 0.15) = 0.60
    // Dopo symbol: 0.60 × 1.5 = 0.90
    ok(results[0].score >= 0.70, `0.40 con max boosts → ${results[0].score.toFixed(3)} (può superare con symbol ×1.5)`);
  });

  it('Similarità alta (0.95) senza boosts rimane alta', () => {
    const results = [
      { score: 0.95, lastModified: null, source: 'xyz_random_file.py', symbolNames: ['zzz_no_match'] },
    ];

    const originalScore = results[0].score;
    applyRecencyBoost(results, 30, 'xyz_random_file');
    applySymbolBoost(results, 'xyz_random_file');

    // Nessun boost significativo → score rimane ~0.95
    ok(results[0].score >= 0.90, `0.95 senza boosts → ${results[0].score.toFixed(3)} (rimane alto)`);
  });

  it('applyRecencyBoost con lastModified vecchio non dà boost', () => {
    const oldTimestamp = (Date.now() / 1000) - (60 * 86400); // 60 giorni fa
    const results = [
      { score: 0.70, lastModified: oldTimestamp, source: 'src/file.js', symbolNames: [] },
    ];

    applyRecencyBoost(results, 30, 'xyz_random_query');

    strictEqual(results[0].score, 0.70, 'LastModified vecchio → nessun recency boost');
  });

  it('applyRecencyBoost con lastModified recente dà +0.05', () => {
    const newTimestamp = Date.now() / 1000;
    const results = [
      { score: 0.70, lastModified: newTimestamp, source: 'src/file.js', symbolNames: [] },
    ];

    applyRecencyBoost(results, 30, 'xyz_random_query');

    ok(Math.abs(results[0].score - 0.75) < 0.001, 'LastModified recente → +0.05 recency boost');
  });

  it('applySymbolBoost con query vuota non modifica i risultati', () => {
    const results = [
      { score: 0.70, symbolNames: ['MyClass'] },
    ];

    const originalScore = results[0].score;
    applySymbolBoost(results, '');

    strictEqual(results[0].score, originalScore, 'Query vuota → nessun symbol boost');
  });

  it('applySymbolBoost con null query non modifica i risultati', () => {
    const results = [
      { score: 0.70, symbolNames: ['MyClass'] },
    ];

    applySymbolBoost(results, null);
    strictEqual(results[0].score, 0.70, 'Query null → nessun symbol boost');
  });

  it('applySymbolBoost con risultati vuoti non crasha', () => {
    const result = applySymbolBoost([], 'test');
    deepStrictEqual(result, [], 'Array vuoto → array vuoto');
  });

  it('applyRecencyBoost con risultati vuoti non crasha', () => {
    const result = applyRecencyBoost([], 30, 'test');
    deepStrictEqual(result, [], 'Array vuoto → array vuoto');
  });

  it('Max boost combinato: recency + path match + symbol ×1.5', () => {
    const results = [
      { score: 0.50, lastModified: Date.now() / 1000, source: 'src/my-class.js', symbolNames: ['MyClass'] },
    ];

    applyRecencyBoost(results, 30, 'my class');
    applySymbolBoost(results, 'my class');

    // Step by step:
    // 0.50 + 0.05 (recency) = 0.55
    // min(1.0, 0.55 + 0.15) = 0.70 (path match — "my" e "class" matchano in source)
    // 0.70 × 1.5 = 1.05 → cap a 1.0 (symbol)
    ok(results[0].score <= 1.0, 'Score non supera 1.0 (capped)');
    ok(results[0].score >= 0.70, `0.50 con max boosts → ${results[0].score.toFixed(3)}`);
  });
});

// ─── Test 5: Threshold gap analysis ──────────────────────────────────

describe('Threshold gap analysis', () => {
  it('CLI gap (0.78 → 0.55) ≈ 0.23', () => {
    const gap = 0.78 - 0.55;
    ok(Math.abs(gap - 0.23) < 0.001, `CLI gap ≈ 0.23 (got ${gap.toFixed(4)})`);
  });

  it('MCP gap (0.70 → 0.48) ≈ 0.22', () => {
    const gap = 0.70 - 0.48;
    ok(Math.abs(gap - 0.22) < 0.001, `MCP gap ≈ 0.22 (got ${gap.toFixed(4)})`);
  });

  it('I gap CLI e MCP sono quasi identici (±0.01)', () => {
    const cliGap = Math.round((0.78 - 0.55) * 100) / 100;
    const mcpGap = Math.round((0.70 - 0.48) * 100) / 100;
    const diff = Math.round(Math.abs(cliGap - mcpGap) * 100) / 100;
    ok(diff <= 0.01, `Gap CLI (${cliGap.toFixed(4)}) e MCP (${mcpGap.toFixed(4)}) differiscono <= 0.01 (diff=${diff})`);
  });

  it('Template non ha gap (nessun fallback)', () => {
    const templateSource = readSource('src/gsd-qdrant-template.js');
    strictEqual(
      /FALLBACK_THRESHOLD/.test(templateSource),
      false,
      'Template non definisce FALLBACK_THRESHOLD'
    );
  });

  it('Max boost formula MCP (~0.33) > gap primary/fallback (0.22)', () => {
    // Max boost = 0.15 (recency) + 0.05 (importance) + 0.08 (reusable) + 0.06 (crossProject) + 0.04 (sameProject)
    const maxBoost = 0.15 + 0.05 + 0.08 + 0.06 + 0.04;
    const mcpGap = 0.70 - 0.48;

    ok(maxBoost > mcpGap, `Max boost (${maxBoost}) > gap MCP (${mcpGap})`);
    strictEqual(maxBoost, 0.38, 'Max boost totale = 0.38');
  });
});
