---
id: T04
parent: S02
milestone: M005
key_files:
  - index.js — buildCodeText: path grezzo pre-pendato come prima linea per massimo peso posizionale bge-m3
duration: 
verification_result: passed
completed_at: 2026-04-27T15:44:55.876Z
blocker_discovered: false
---

# T04: Prepend full file path as first line in buildCodeText so bge-m3 gives it highest positional weight for code embeddings

**Prepend full file path come prima linea in buildCodeText per massimo peso posizionale bge-m3**

## What Happened

Analisi della funzione buildCodeText in index.js: la versione precedente (modificata da T03) metteva `path:${relPath}` come secondo elemento nell'array di metadata, mescolato con project, language e kind. Questo dava al path un peso posizionale medio — non ottimale per bge-m3 che dà maggiore attenzione ai token all'inizio del testo.

Modifica implementata:
1. Sostituito `path:${relPath}` (secondo elemento) con `${relPath}` come PRIMO elemento dell'array restituito da buildCodeText. Il path grezzo senza prefisso "path:" permette a bge-m3 di riconoscere naturalmente il percorso del file.
2. Rimossa la riga `path:` dall'output — non è più necessaria come metadata separato perché il path è ora il contesto principale dell'embedding.
3. Tutti gli altri campi (project, language, kind, exports, imports, symbols, comments, signatures) sono preservati dopo il path.

Verifica: testata con 9 scenari unitari — payload normale, payload vuoto, payload parziale, path annidato (packages/core/src/utils/helpers.ts), verifica che nessun "path:" prefix rimanga nell'output, e validazione sintassi del file index.js tramite node -c. Tutti i test funzionali passano (8/8) più la validazione syntax check.