---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T03: Migliorare buildCodeText per dare peso a signature/exports/imports

Modificare la funzione buildCodeText per dare priorità a signature, exports e imports nel testo di embedding.

Steps:
1. Trovare la funzione buildCodeText in index.js o modulo correlato
2. Analizzare come costruisce il testo corrente
3. Modificare per ripetere signatures/exports all'inizio della stringa (peso posizionale)
4. Esempio: prepend `SIGNATURES: ${sig1} | ${sig2} || EXPORTS: ${exp1} | ${exp2} || ` al testo originale
5. Mantenere la lunghezza ragionevole per non saturare il modello

Files likely touched: `index.js` (funzione buildCodeText)
Verify: confrontare embedding di codice con vs senza weighting → verificare differenza nei risultati di ricerca

## Inputs

- `index.js`

## Expected Output

- `buildCodeText modifica: signatures/exports/imports in alto nella stringa`

## Verification

node src/cli.js context 'implementare auth middleware' → deve trovare file con middleware signature/exports prima di file generici; console.log del testo buildCodeText per verificare ripetizioni signatures
