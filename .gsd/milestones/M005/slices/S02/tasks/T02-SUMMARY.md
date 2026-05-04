---
id: T02
parent: S01
milestone: M005
key_files:
  - src/intent-detector.js — buildQdrantFilter() aggiornato per type hint → should soft boost
duration: 
verification_result: passed
completed_at: 2026-04-27T14:30:00.000Z
blocker_discovered: false
---

# T02: Aggiornare buildQdrantFilter per type hint come soft boost (should) invece di hard filter (must)

**Type hints (config/example/template) mappati a payload='code' con soft boost in should[], non più hard filter in must[]**

## What Happened

Analisi della funzione buildQdrantFilter() in intent-detector.js: i type hint come "config", "example", "template" venivano trattati come hard filter (must clause). Questo era troppo restrittivo — se un documento ha tipo diverso ma è semanticamente pertinente, viene escluso.

Modifica implementata:
1. Type hints sono ora mappati a payload='code' con soft boost in `should[]` invece di hard filter in `must[]`.
2. Language e project_id restano in `must[]` (certi). Tags vanno sempre in `should[]`.
3. Il mapping TYPE_MAP: config→code, example→code, template→code, utility→code, ecc.

Verifica: testata con 5 scenari unitari — query con type hint, query senza filter, query solo tags. Tutti producono output corretto senza errori.