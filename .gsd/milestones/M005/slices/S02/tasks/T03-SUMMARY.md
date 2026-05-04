---
id: T03
parent: S02
milestone: M005
key_files:
  - src/gsd-qdrant-template.js — buildCodeText: signatures/exports/imports pre-pendati come header strutturato con peso posizionale per bge-m3
duration: 
verification_result: passed
completed_at: 2026-04-27T15:31:25.961Z
blocker_discovered: false
---

# T03: Prepend signatures/exports/imports as weighted header in buildCodeText so bge-m3 gives structural elements higher positional weight

**Prepend signatures/exports/imports come header strutturato con peso posizionale per bge-m3**

## What Happened

Analisi della funzione buildCodeText in src/gsd-qdrant-template.js: la versione precedente univa signatures, exports, imports, symbols e comments in un array piatto separato da newline, senza dare priorità ai elementi strutturali del codice.

Modifica implementata:
1. Le firme delle funzioni (signatures), gli export e gli import sono ora pre-pendati come header strutturato con prefisso "SIGNATURES:" — i token all'inizio del testo ricevono maggiore attenzione da bge-m3 grazie al bias posizionale dei transformer.
2. Il corpo del testo (metadata + comments) segue dopo l'header, mantenendo una lunghezza totale ragionevole (~500-3500 chars a seconda della complessità).
3. Budget di 2000 char per l'header e 4000 char per il body — se superati, il testo viene troncato.
4. Se non ci sono elementi strutturali (tutte le array vuote), l'header "SIGNATURES:" viene omesso completamente invece di apparire vuoto.

Verifica: testata con 4 scenari unitari — payload normale, payload vuoto, payload parziale e payload grande (60+ signatures). Tutti producono output corretto senza errori.