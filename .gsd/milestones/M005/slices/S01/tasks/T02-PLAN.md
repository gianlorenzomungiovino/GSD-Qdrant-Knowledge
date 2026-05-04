---
estimated_steps: 8
estimated_files: 1
skills_used: []
---

# T02: Convertire filtri should→must quando intento è certo

Modificare `src/intent-detector.js` per convertire il payload di filtro Qdrant da `should` (soft) a `must` (hard) quando tipo/linguaggio/progetto hanno valore certo.

Steps:
1. Leggere intent-detector.js per capire come costruisce filter_payload
2. type/language/project con valore certo → must[] invece di should[]
3. Mantenere should[] solo per query ambigue (intent non definito)
4. Log: `console.log('[qdrant] filter: must=%d, should=%d', ...)`

Files: src/intent-detector.js
Verify: 'Node.js async pattern' deve filtrare language=node (must)

## Inputs

- `src/intent-detector.js`

## Expected Output

- `Intent-detector converte should→must per intents certi`

## Verification

node src/cli.js context 'Node.js async pattern'
