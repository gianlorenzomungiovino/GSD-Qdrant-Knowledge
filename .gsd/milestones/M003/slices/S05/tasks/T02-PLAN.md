---
estimated_steps: 8
estimated_files: 1
skills_used: []
---

# T02: Convertire filtri should→must quando intento è certo

Modificare `src/intent-detector.js` per convertire i payload di filtro Qdrant da `should` (soft) a `must` (hard) quando l'intento identifica tipo, linguaggio o progetto con certezza.

Steps:
1. Leggere intent-detector.js per capire come costruisce il filter_payload
2. Quando type/language/project hanno valore certo → usare must[] invece di should[]
3. Mantenere should[] solo per query ambigue (intent non definito)
4. Aggiungere log: `console.log('[qdrant] filter: must=%d, should=%d', must.length, should.length);`

Files likely touched: `src/intent-detector.js`
Verify: query specifica 'Node.js async/await pattern' deve filtrare per language=node e type=code (must)

## Inputs

- `src/intent-detector.js`

## Expected Output

- `Intent-detector converte should→must per intents certi`

## Verification

Verificare che intent-detector restituisca filter con must[] per intents noti; node src/cli.js context 'Node.js async pattern' non dovrebbe restituire risultati JS se language=node è certo
