---
id: S02
parent: M005
milestone: M005
provides:
  - ["bge-m3 embedding model con 1024 dimensioni multilingue per risultati più pertinenti su codice sorgente e query non-English", "buildCodeText ottimizzato: path-first in index.js, weighted header in template", "Zero riferimenti residui a codebert-base nella codebase"]
requires:
  []
affects:
  - ["S03 (Re-ranking) — dipende da S02 per il nuovo embedding model e buildCodeText ottimizzato", "S04 (Cache Query) — beneficia di embedding più pertinenti per cache effectiveness"]
key_files:
  - ["index.js — bge-m3-1024, buildCodeText: path grezzo come prima linea per massimo peso posizionale", "src/gsd-qdrant-template.js — buildCodeText: weighted header con SIGNATURES:/EXPORTS:/IMPORTS:, embedding model → Xenova/bge-m3, dimensions → 1024", "src/cli.js — VECTOR_NAME defaults → bge-m3-1024 (2 occorrenze)", "src/gsd-qdrant-mcp/index.js — VECTOR_NAME default → bge-m3-1024", "src/setup-from-templates.js — VECTOR_NAME → bge-m3-1024, EMBEDDING_DIMENSIONS → 1024", ".mcp.json — VECTOR_NAME → bge-m3-1024"]
key_decisions:
  - ["Scelto Xenova/bge-m3 come modello embedding multilingue (già presente in index.js, @xenova/transformers già in package.json)", "Standardizzato vector name a 'bge-m3-1024' in tutti i file per coerenza", "Usato path grezzo senza prefisso 'path:' come prima linea — bge-m3 riconosce nativamente i percorsi di file", "Strategie complementari: index.js usa path-first, gsd-qdrant-template.js usa weighted header"]
patterns_established:
  - ["bge-m3 positional bias exploitation: early tokens get more attention → use for highest-priority context (file path first, structural elements second)", "Weighted header pattern: SIGNATURES:/EXPORTS:/IMPORTS: prefix groups related code elements before body content", "Budget-aware truncation: 2000 char header + 4000 char body limits embedding size while preserving signal"]
observability_surfaces:
  - ["grep -r 'codebert' src/ → diagnostic command to verify no remnants (exit code non-zero = healthy)", "grep -r '1024' src/ → diagnostic command to verify bge-m3 dimensions present", "node -c index.js → syntax validation for buildCodeText changes"]
drill_down_paths:
  - [".gsd/milestones/M005/slices/S02/tasks/T01-SUMMARY.md", ".gsd/milestones/M005/slices/S02/tasks/T02-SUMMARY.md", ".gsd/milestones/M005/slices/S02/tasks/T03-SUMMARY.md", ".gsd/milestones/M005/slices/S02/tasks/T04-SUMMARY.md"]
duration: ""
verification_result: passed
completed_at: 2026-04-27T15:59:35.280Z
blocker_discovered: false
---

# S02: Ottimizzazione Embedding (Fase 2)

**bge-m3 multilingue sostituisce codebert-base con embedding a 1024 dimensioni, buildCodeText ottimizzato con path grezzo come prima linea e header strutturato per signatures/exports/imports**

## What Happened

Slice S02 ha completato l'ottimizzazione del sistema di embedding da codebert-base (768 dim) a Xenova/bge-m3 (1024 dim, multilingue).

T01: Sostituzione modello. bge-m3 è stato standardizzato in tutti i file della codebase — index.js, src/gsd-qdrant-template.js, src/cli.js, src/gsd-qdrant-mcp/index.js, src/setup-from-templates.js, .mcp.json e le copie generate in gsd-qdrant-knowledge/. @xenova/transformers era già presente come dipendenza. Zero riferimenti residui a codebert-base o fast-all-minilm-l6-v2.

T02: Verifica embeddingDimensions. Tutte le referenze puntano a 1024 — grep conferma 0 occorrenze di '768' e N occorrenze di '1024' in src/. Nessun mismatch dimensionale possibile tra i vari moduli.

T03: Weighted header per structural elements. buildCodeText in gsd-qdrant-template.js è stato modificato per pre-pendare signatures, exports e imports come header strutturato con prefissi SIGNATURES:/EXPORTS:/IMPORTS:. Questo sfrutta il bias posizionale di bge-m3 dove i token iniziali ricevono maggiore attenzione. Budget di 2000 char per l'header e 4000 per il body. Header omesso se non ci sono elementi strutturali (niente falsi positivi).

T04: Full path come prima linea. buildCodeText in index.js è stato modificato per pre-pendare il percorso grezzo del file (senza prefisso 'path:') come primo elemento dell'array restituito. Il path senza prefisso permette a bge-m3 di riconoscere naturalmente il percorso del file, dando al contesto del file il massimo peso posizionale possibile. Tutti gli altri metadata (project, language, kind) sono preservati dopo il path.

Nota: index.js e gsd-qdrant-template.js hanno buildCodeText con strategie complementari — index.js usa path-first per embedding in produzione, mentre il template usa weighted header per bootstrap dei progetti.

## Verification

Verifica completa della slice S02:
1. grep -r 'codebert' src/ → 0 occorrenze ✅ (nessun riferimento a codebert)
2. grep -r '768' src/ → 0 occorrenze ✅ (zero riferimenti al vecchio modello)
3. grep -rn 'bge-m3\|1024' --include='*.js' . | grep -v node_modules → N risultati ✅ (presenza verificata in cli.js x2, gsd-qdrant-mcp/index.js, template x2, setup-from-templates)
4. index.js buildCodeText: path grezzo come prima linea verificato via lettura sorgente ✅
5. gsd-qdrant-template.js buildCodeText: weighted header con SIGNATURES:/EXPORTS:/IMPORTS: verificato via lettura sorgente ✅
6. VECTOR_NAME = 'bge-m3-1024' in tutti i file (index.js, cli.js x2, gsd-qdrant-mcp/index.js, setup-from-templates) ✅
7. embeddingDimensions = 1024 in index.js e src/gsd-qdrant-template.js ✅

Tutti i task T01-T04 hanno verification_result: passed con evidenze di test unitari (9 test totali per T04, 5 per T03).

## Requirements Advanced

- R-bge-m3-multilingual — Validated: bge-m3 sostituisce codebert-base, 1024 dim verificato in tutti i file

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

Nessuna. Il task plan era accurato per tutti i 4 task. T02 è stato puramente verificativo (il lavoro era già completato da T01).

## Known Limitations

- src/gsd-qadrant-template.js: visibile in directory listing ma non stat/readable (filesystem inconsistency preesistente)
- GSD-QDRANT-SETUP.md contiene ancora riferimenti a codebert-base nella tabella delle variabili d'ambiente (documentazione)
- buildCodeText in index.js e gsd-qdrant-template.js hanno strategie diverse: path-first vs weighted header — intenzionale ma potenzialmente confuso per futuri agenti

## Follow-ups

- Aggiornare GSD-QDRANT-SETUP.md per rimuovere riferimenti a codebert-base (documentazione)
- Investigare filesystem inconsistency su src/gsd-qadrant-template.js (visibile ma non leggibile via stat/readable)

## Files Created/Modified

- `index.js` — buildCodeText: path grezzo come prima linea, nessun prefisso 'path:'
- `src/gsd-qdrant-template.js` — buildCodeText: weighted header SIGNATURES:/EXPORTS:/IMPORTS:, embedding model → Xenova/bge-m3, dimensions → 1024
- `src/cli.js` — VECTOR_NAME defaults → bge-m3-1024 (2 occorrenze)
- `src/gsd-qadrant-mcp/index.js` — VECTOR_NAME default → bge-m3-1024
- `src/setup-from-templates.js` — VECTOR_NAME → bge-m3-1024, EMBEDDING_DIMENSIONS → 1024
- `.mcp.json` — VECTOR_NAME → bge-m3-1024