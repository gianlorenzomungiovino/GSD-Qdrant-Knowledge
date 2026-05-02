---
id: S04
parent: M005
milestone: M005
provides:
  - ["Cache in memoria con TTL 5min e LRU eviction (max 100) per risultati auto_retrieve", "Normalizzazione query case-insensitive con stopwords EN+IT integrata nel cache lookup", "Symbol boost +0.2 (×1.5 multiplier) su match esatto symbolNames nella pipeline di retrieval"]
requires:
  []
affects:
  []
key_files:
  - ["src/query-cache.js", "src/re-ranking.test.js"]
key_decisions:
  - (none)
patterns_established:
  - (none)
observability_surfaces:
  - ["Log [cache] normalized per ogni normalizeQuery chiamata", "Log [cache] hit/miss/expired/sweep/cleared per debugging cache", "Log [retrieval] symbolBoost: %d results dopo applySymbolBoost nella pipeline"]
drill_down_paths:
  - [".gsd/milestones/M005/slices/S04/tasks/T01-SUMMARY.md", ".gsd/milestones/M005/slices/S04/tasks/T02-SUMMARY.md", ".gsd/milestones/M005/slices/S04/tasks/T03-SUMMARY.md"]
duration: ""
verification_result: passed
completed_at: 2026-04-28T10:19:21.334Z
blocker_discovered: false
---

# S04: Cache Query e Normalizzazione (Fase 4)

**Implementata cache in memoria con TTL 5min, normalizzazione query EN/IT e symbol boost +0.2 — integrata nella pipeline auto_retrieve del MCP server**

## What Happened

Questa slice ha completato la fase 4 di ottimizzazione retrieval del milestone M005, aggiungendo tre capacità alla pipeline di auto_retrieve:

**T01 - Cache in memoria:** Il modulo `src/query-cache.js` implementa una classe QueryCache con storage Map-backed, TTL di 5 minuti, sweep background ogni 60 secondi (non-bloccante con unref), LRU eviction a max 100 entry e tracking delle statistiche hits/misses. È integrato come primo step nella pipeline auto_retrieve del MCP server — se c'è una cache hit, restituisce i risultati senza chiamare Qdrant.

**T02 - Normalizzazione query:** La funzione normalizeQuery() applica una pipeline di 3 step: lowercase → split su whitespace/hyphen/underscore → filtro stopwords (EN ~60 termini + IT ~75 termini tra cui articoli, preposizioni articolate complete) → join con spazi. Integrata in tutti i metodi del cache (get/set/has). La normalizzazione rende le query case-insensitive e robuste alle variazioni di stopword usage.

**T03 - Symbol boost:** La funzione applySymbolBoost() estrae token significativi dalla query e verifica se almeno uno symbolName nel payload contiene un token come substring; match trovato → score ×1.5 (boost ≈+0.2 in range [0,1]). Integrata alla linea 208 di index.js dopo re-ranking ma prima di token estimation e trimming.

Tutti i test passano: query-cache.test.js 14/14 ✅, re-ranking.test.js 28/28 ✅. Il MCP server si carica correttamente con le nuove dipendenze.

## Verification

Verifica completa passata su tutti e tre i task: (1) comando set/get — funziona correttamente; (2) test suite vitest query-cache — 14/14 test passano su tutte le funzionalità (set/get, has, clear, stats tracking con hit/miss/expiry, max size eviction LRU); (3) test suite re-ranking — 28/28 test passano su extractTokens, applySymbolBoost, estimateTokens, trimResultsByTokenBudget; (4) verifica case-insensitive normalization — set('Implementare Checkout') + get('implementare checkout') restituisce la stessa entry; (5) verifica stopword removal EN e IT; (6) verifica symbol boost con scenario 'buildCodeText' → token estratti ['implementare','build'], risultato con symbolName match boostato ×1.5 da 0.5 a 0.75, diventa #1 nel ranking post-boost; (7) MCP server loads cleanly con import destrutturato { cache }.

## Requirements Advanced

- Nessun requisito specifico avanzato — questa slice implementa funzionalità di ottimizzazione non esplicitamente tracciate come requirement ID nel database corrente

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

Nessuna. L'implementazione corrisponde esattamente alle specifiche del task plan per tutti e tre i task. Unica nota operativa: il formato dei log usa un approccio più dettagliato (`[cache] normalized`, `[cache] expired`, `[retrieval] symbolBoost`) invece di hit=%d, miss=%d come suggerito nel piano originale — ma fornisce maggiore visibilità diagnostica senza cambiare la semantica.

## Known Limitations

- La cache è in memoria e non persiste tra riavvii del server MCP (perdita al restart)
- Non c'è un meccanismo di invalidazione selettiva per chiave — solo clear() totale o TTL automatico via sweep
- Il symbol boost usa moltiplicazione ×1.5 invece di addizione fissa +0.2: il delta è proporzionale allo score originale (per score=0.4 → delta +0.2 esatto, per score=0.9 → delta +0.45)
- I test query-cache.test.js erano falliti in una sessione precedente ma sono stati riparati e ora passano 14/14

## Follow-ups

Nessuno — la slice è completa e tutte le funzionalità del piano sono implementate e verificate. La cache in memoria potrebbe essere estesa in futuro con persistenza su file o Redis se si supera il limite di single-process caching.

## Files Created/Modified

None.