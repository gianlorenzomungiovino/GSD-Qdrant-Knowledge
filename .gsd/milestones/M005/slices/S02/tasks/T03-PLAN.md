---
estimated_steps: 8
estimated_files: 1
skills_used: []
---

# T03: Migliorare buildCodeText per dare peso a signature/exports/imports

Modificare la funzione buildCodeText per dare priorità a signatures, exports e imports.

Steps:
1. Trovare buildCodeText in index.js
2. Prependere: 'SIGNATURES: sig1 | sig2 || EXPORTS: exp1 || IMPORTS: imp1 ||' al testo originale
3. Mantenere lunghezza ragionevole per non saturare il modello
4. Testare con codice reale

Files: index.js (funzione buildCodeText)
Verify: confrontare embedding di codice con vs senza weighting

## Inputs

- `index.js`

## Expected Output

- `buildCodeText con signatures/exports in cima alla stringa`

## Verification

node src/cli.js context 'implementare auth middleware' → trova file con signature/exports
