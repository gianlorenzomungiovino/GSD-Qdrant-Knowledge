---
id: M005
title: "Ottimizzazione Retrieval e Performance"
status: complete
completed_at: 2026-04-28T10:30:32.152Z
key_decisions:
  - Flat search + re-ranking preferita a searchPointGroups per flessibilità, con LIMIT=30 e soglie abbassate (primary=0.7, fallback=0.55)
  - bge-m3 scelto su codebert-base: multilingue (100+ lingue), 1024 dim Cosine embeddings — sostituisce codebert-768 che era solo inglese
  - extractKeywords() come safety net per query non-filtered; normalizzazione primaria fatta dall'LLM via KNOWLEDGE.md
  - Type hint → soft boost (should) invece di hard filter (must): "config" mapped to payload="code" con +0.15 path matching
  - Cache in memoria con TTL 5min + LRU eviction max 100 entry; cache key include includeContent per evitare collisioni
key_files:
  - index.js — bge-m3-1024, flat search LIMIT=30, SCORE_THRESHOLD=0.7, fallback 0.55
  - src/re-ranking.js (new) — applyRecencyBoost(), estimateTokens(), trimResultsByTokenBudget()
  - src/query-cache.js (new) — TTL 5min, LRU eviction max 100, cache key: task|limit|includeContent
  - src/cli.js — extractKeywords fallback + flat search integration
  - src/gsd-qdrant-mcp/index.js — re-ranking + cache + symbol boost nella pipeline auto_retrieve
  - src/intent-detector.js — buildQdrantFilter aggiornato: type hint → should soft boost, project_id → should
lessons_learned:
  - Flat search con LIMIT=30 dà al re-ranker più candidati da filtrare rispetto a group_by='source' limit=5
  - bge-m3 multilingue risolve il problema di retrieval su query italiane che codebert-base non gestiva bene
  - Type hint come soft boost è più flessibile: risultati con tipo diverso possono comunque apparire se semanticamente pertinenti
---

# M005: Ottimizzazione Retrieval e Performance

**Pipeline di retrieval potenziata con bge-m3 (1024 dim, multilingue), flat search + re-ranking recency/path matching, cache in memoria TTL 5min — risultati più pertinenti in meno token**

## What Happened

M005 ha completato 4 slice verticali che hanno trasformato la pipeline di retrieval da ricerca vettoriale base a sistema ottimizzato con multiple stratagemmi di precisione:

**S01 — Flat Search + Soglie:** Sostituita searchPointGroups() con flat search(LIMIT=30, SCORE_THRESHOLD=0.7, FALLBACK_THRESHOLD=0.55). Più candidati per il re-ranker, soglie più basse perché il re-ranking fa il lavoro di filtraggio. Verificato: query generiche restituiscono risultati pertinenti con score ≥ 0.9547.

**S02 — Embedding bge-m3:** Xenova/bge-m3 (1024 dim, multilingue) sostituito a codebert-base (768 dim). BGE-M3 supporta 100+ lingue con embedding Cosine ottimizzati per retrieval. buildCodeText mantenuto con path-first e weighted header SIGNATURES:/EXPORTS:/IMPORTS:. Zero riferimenti residui al vecchio modello.

**S03 — Re-ranking Risultati:** Nuovo modulo src/re-ranking.js con applyRecencyBoost() (+0.05 per file <30gg), path matching (+0.15 quando parole query corrispondono al percorso sorgente), estimateTokens() (~4 chars/token) e trimResultsByTokenBudget(). lastModified campo aggiunto durante indicizzazione via git log -1 --format=%ct. Token estimation + troncamento integrato in CLI e MCP server.

**S04 — Cache Query e Normalizzazione:** src/query-cache.js implementa cache Map-backed con TTL 5min, sweep background non-bloccante ogni 60s, LRU eviction a max 100 entry. normalizeQuery() applica lowercase + split + stopword filter (EN ~60 + IT ~75 termini) + join. applySymbolBoost() estrae token significativi e moltiplica score ×1.5 per match esatto su symbolNames. Integrato come primo step nella pipeline auto_retrieve del MCP server.

Tutti i test passano: intent-detector.test.js 27/27, re-ranking.test.js 28/28, query-cache.test.js 14/14. Syntax check OK per tutti i file modificati.

## Success Criteria Results

- **Flat search con soglie basse:** ✅ S01 implementato — flat search LIMIT=30, SCORE_THRESHOLD=0.7, FALLBACK_THRESHOLD=0.55. Verificato: query generiche restituiscono risultati pertinenti
- **Nuovo embedding model multilingue:** ✅ S02 implementato — Xenova/bge-m3 (1024 dim) sostituisce codebert-base (768 dim). buildCodeText ottimizzato con path-first e weighted header. grep 'codebert' → 0 occorrenze in src/
- **Risultati re-rankati privilegiano codice recente:** ✅ S03 implementato — applyRecencyBoost() +0.05 per file <30gg, path matching +0.15, token estimation e troncamento a ~4000 token. lastModified da git log integrato in indicizzazione
- **Query ripetute servite da cache:** ✅ S04 implementato — src/query-cache.js con TTL 5min, LRU eviction max 100 entry, normalizeQuery() EN/IT stopwords. Symbol boost ×1.5 per match symbolNames. Integrato come primo step in auto_retrieve

## Definition of Done Results

- [x] S01 complete (4/4 task) — flat search + threshold verificati
- [x] S02 complete (4/4 task) — bge-m3 1024 dim, buildCodeText ottimizzato, zero riferimenti codebert
- [x] S03 complete (4/4 task) — re-ranking recency/path matching, token estimation/truncation
- [x] S04 complete (3/3 task) — cache in memoria TTL 5min, normalizzazione EN/IT, symbol boost ×1.5
- [x] Tutti i test passano: intent-detector.test.js 27/27 ✅, re-ranking.test.js 28/28 ✅, query-cache.test.js 14/14 ✅
- [x] Syntax check OK per index.js, cli.js, re-ranking.js, query-cache.js, gsd-qdrant-mcp/index.js

## Requirement Outcomes

- **R-bge-m3-multilingual:** active → validated — bge-m3 sostituisce codebert-base, 1024 dim verificato in tutti i file
- **R-flat-search-re-ranking:** active → validated — Flat search LIMIT=30 + re-ranking recency/path matching implementati e verificati

## Deviations

Nessuna. L'implementazione corrisponde esattamente alle specifiche del task plan in tutte le 4 slice.

## Follow-ups

- Considerare persistenza cache su file o Redis se si supera il limite di single-process caching
- Aggiornare GSD-QDRANT-SETUP.md per rimuovere riferimenti residui a codebert-base nella documentazione