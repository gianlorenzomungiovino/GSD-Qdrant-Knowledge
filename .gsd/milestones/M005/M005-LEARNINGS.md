---
phase: extract-learnings
phase_name: Milestone Completion Learnings Extraction
project: GSD-Qdrant-Knowledge
generated: "2026-04-28T12:30:00.000Z"
counts:
  decisions: 5
  lessons: 4
  patterns: 4
  surprises: 0
missing_artifacts: []
---

# M005 Learnings — Ottimizzazione Retrieval e Performance (bge-m3 + flat search)

## Decisions

- **Flat search preferita a searchPointGroups per flessibilità** — Flat search con LIMIT=30 dà al re-ranker più candidati da filtrare. Soglie abbassate: SCORE_THRESHOLD=0.7, FALLBACK_THRESHOLD=0.55 (prima 0.85/0.75). Il re-ranking fa il lavoro di deduplicazione e filtraggio.
  Source: .gsd/milestones/M005/slices/S01/S01-SUMMARY.md

- **bge-m3 scelto su codebert-base** — Xenova/bge-m3 (1024 dim, multilingue 100+ lingue) sostituisce codebert-base (768 dim, solo inglese). BGE-M3 è ottimizzato per retrieval con embedding Cosine. Zero nuove dipendenze (@xenova/transformers già presente in package.json).
  Source: .gsd/milestones/M005/slices/S02/S02-SUMMARY.md

- **Type hint → soft boost (should) invece di hard filter (must)** — Type hints come "config", "example" mappati a payload="code" con +0.15 in should[]. Risultati con tipo diverso possono apparire se semanticamente pertinenti, più flessibile del filtro must rigido.
  Source: .gsd/milestones/M005/slices/S01/S01-SUMMARY.md

- **Cache in memoria con TTL 5min + LRU eviction max 100 entry** — Scelto approccio single-process senza persistenza su file o Redis. Zero dipendenze esterne, zero configurazione aggiuntiva. Perdita al restart accettabile per uso MCP server stateless.
  Source: .gsd/milestones/M005/slices/S04/S04-SUMMARY.md

- **Symbol boost moltiplicativo ×1.5 invece di additivo fisso +0.2** — Delta proporzionale allo score originale (score=0.4→+0.2 esatto, score=0.9→+0.45). Preserva la gerarchia dei risultati mentre dà priorità a match simbolici esatti.
  Source: .gsd/milestones/M005/slices/S04/S04-SUMMARY.md

## Lessons

- **Flat search con LIMIT=30 compensa soglie più basse** — Prima si usava group_by='source' limit=2 per deduplicare, ora flat search restituisce più risultati dello stesso documento ma il re-ranking (recency + path match) filtra efficacemente. Soglia 0.7 invece di 0.85 è accettabile perché il re-ranking fa il lavoro pesante.
  Source: .gsd/milestones/M005/slices/S01/S01-SUMMARY.md

- **bge-m3 positional bias è potente per code indexing** — Token iniziali ricevono più attenzione → sfruttare con path grezzo come prima linea (senza prefisso 'path:') e structural elements (SIGNATURES:/EXPORTS:/IMPORTS:) come header strutturato. Budget-aware: 2000 char header + 4000 char body.
  Source: .gsd/milestones/M005/slices/S02/S02-SUMMARY.md

- **Cache in memoria perde stato al restart del server MCP** — Valutare persistenza su file o Redis se si supera il limite di single-process caching e serve statefulness tra riavvii. Per uso corrente (MCP server stateless) è accettabile.
  Source: .gsd/milestones/M005/slices/S04/S04-SUMMARY.md

- **Symbol boost moltiplicativo ×1.5 dà delta proporzionale** — Per score=0.4→delta +0.2 esatto, per score=0.9→delta +0.45. Più aggressivo su risultati già alti, potenzialmente altera la gerarchia più di un additivo fisso. Monitorare in produzione.
  Source: .gsd/milestones/M005/slices/S04/S04-SUMMARY.md

## Patterns

- **Re-ranking pipeline completa:** threshold filter → map to result objects with _query → applyRecencyBoost() → sort descending → limit K → token estimation → trimResultsByTokenBudget → clean internal flags → JSON output. Pattern consolidato in S03 e integrato sia in CLI che MCP server.
  Source: .gsd/milestones/M005/slices/S03/S03-SUMMARY.md

- **Payload spread pattern:** hit.payload è spread sul top-level del result object, quindi lastModified e source sono accessibili direttamente (non nidificati sotto payload). Consente re-ranking senza conoscere la struttura interna di Qdrant.
  Source: .gsd/milestones/M005/slices/S03/S03-SUMMARY.md

- **Graceful degradation per campi opzionali:** lastModified mancante gestita senza errori (fallback a 0), non-fatal operations wrapate in try/catch. Il sistema continua a funzionare anche con dati incompleti o schema evolutivo.
  Source: .gsd/milestones/M005/slices/S03/S03-SUMMARY.md

- **Normalizzazione query EN+IT:** normalizeQuery() pipeline di 3 step — lowercase → split su whitespace/hyphen/underscore → filtro stopwords (~60 EN + ~75 IT tra cui articoli, preposizioni articolate complete) → join con spazi. Rende le query case-insensitive e robuste a variazioni di stopword usage.
  Source: .gsd/milestones/M005/slices/S04/S04-SUMMARY.md

## Surprises

Nessuna sorpresa significativa — l'implementazione ha seguito il piano previsto senza deviazioni inattese. T03 path matching di S03 è stato completato durante T02 invece che come step separato, ma si tratta di un'ottimizzazione pianificabile piuttosto che una sorpresa.