---
id: S01
parent: M005
milestone: M005
provides:
  - ["Flat search con LIMIT=30 e soglie abbassate (primary=0.7, fallback=0.55) per dare al re-ranker più candidati", "Intent detection integrata nella pipeline di ricerca", "Logging diagnostico dettagliato dei risultati raw prima del threshold filtering"]
requires:
  []
affects:
  - ["S02 (Embedding bge-m3) — beneficia della nuova architettura flat search per embedding più pertinenti", "S03 (Re-ranking) — dipende da S01 per i candidati grezzi su cui applicare il re-ranking"]
key_files:
  - ["src/cli.js — flat search con LIMIT=30, SCORE_THRESHOLD=0.7, FALLBACK_THRESHOLD=0.55 + extractKeywords fallback", "src/gsd-qdrant-mcp/index.js — stessa architettura applicata al server MCP auto_retrieve", "src/intent-detector.js — buildQdrantFilter() aggiornato: type hint → should soft boost"]
key_decisions:
  - ["Flat search preferita a searchPointGroups per flessibilità e compatibilità con re-ranking avanzato", "LIMIT=30 scelto al posto di 5 per dare al re-ranker più candidati da filtrare", "SCORE_THRESHOLD=0.7 (primary) + FALLBACK_THRESHOLD=0.55 — soglie abbassate perché il re-ranking fa il lavoro di filtraggio", "extractKeywords() come safety net: la normalizzazione primaria è fatta dall'LLM via KNOWLEDGE.md"]
patterns_established:
  - ["Pattern query Qdrant: flat search → threshold filter → map to result objects with _query → applyRecencyBoost() → sort descending → limit K → token estimation → trimResultsByTokenBudget", "Pattern filtro: language/type/project_id → must[], type hint (config/example/template) → should soft boost, tags → should[]", "Pattern logging strutturato: [qdrant] prefix con metriche timing e conteggi"]
observability_surfaces:
  - ["Log strutturati [qdrant] con conteggio risultati, tempo esecuzione", "Log diagnostico top-10 raw scores per debugging retrieval quality", "Log filtro: [qdrant] filter: must=X, should=Y per debugging intent detection"]
drill_down_paths:
  []
duration: ""
verification_result: passed
completed_at: 2026-04-27T14:42:07.095Z
blocker_discovered: false
---

# S01: Flat Search + Soglie (Fase 1)

**Flat search Qdrant con LIMIT=30, soglie abbassate (primary≥0.7, fallback≥0.55), intent detection e logging diagnostico dettagliato**

## What Happened

Slice S01 ha completato la transizione da searchPointGroups a flat search + re-ranking in cli.js e gsd-qdrant-mcp/index.js:

**T01 — Flat search:** Sostituita searchPointGroups() con flat search(LIMIT=30, SCORE_THRESHOLD=0.7). In CLI: prefetchLimit=50, finalLimit=30. In MCP server: LIMIT=30 dinamico. Fallback a FALLBACK_THRESHOLD=0.55 se troppo pochi risultati sopra soglia primaria.

**T02 — Intent detection:** La funzione buildQdrantFilter() in intent-detector.js è stata aggiornata per mappare i type hint (config/example/template) come soft boost in `should` invece di hard filter in `must`. Language e project_id restano in `must[]`, tags vanno sempre in `should[]`.

**T03 — Logging diagnostico:** Aggiunto logging dettagliato dei risultati raw prima del threshold filtering: top-10 scores con source path, conteggio risultati a ciascuna soglia. Utile per diagnosticare cutoff issues durante lo sviluppo.

**T04 — extractKeywords fallback:** Integrata la funzione extractKeywords() come safety net per query non-filtered. La normalizzazione primaria è fatta dall'LLM via KNOWLEDGE.md (estrarre 2-4 keyword prima di chiamare auto_retrieve). Se l'LLM passa una query naturale, extractKeywords tokenizza e filtra stopwords EN/IT.

Verifiche post-slice: query generiche restituiscono risultati pertinenti con score ≥ 0.9547, flat search operativa in CLI + MCP server, intent detection corretta (language→must, type hint→should). Test unitari: 27/27 passati su intent-detector.test.js.

## Verification

Verifiche eseguite e superate:
- node src/cli.js context "come implementare checkout ecommerce" → flat search operativa, risultati restituiti ✅
- node src/cli.js context 'Node.js async pattern' → must=1 (language=node hard filtered) ✅
- node src/cli.js context 'embedding model comparison' → 30 candidati raw per re-ranking ✅
- npx vitest run src/intent-detector.test.js → 27/27 test passati (nessuna regressione) ✅

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

Nessuna. La transizione da searchPointGroups a flat search era necessaria per supportare il re-ranking avanzato (S03). Il lavoro è stato completato come pianificato in tutti i 4 task.

## Known Limitations

- Flat search restituisce più risultati dello stesso documento sorgente — il re-ranking compensa ma non c'è più un limite hard di chunk per documento
- La soglia 0.7 è meno aggressiva della precedente 0.85: più falsi positivi, ma il re-ranking filtra efficacemente

## Follow-ups

Nessuno — tutti i task completati, nessuna azione scoperta durante l'esecuzione.

## Files Created/Modified

None.