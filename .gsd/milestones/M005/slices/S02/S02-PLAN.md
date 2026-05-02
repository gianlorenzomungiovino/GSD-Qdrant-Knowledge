# S02: Ottimizzazione Embedding (Fase 2)

**Goal:** Sostituire all-MiniLM-L6-v2 con codebert/unixcoder (768 dim), aggiornare embeddingDimensions, migliorare buildCodeText, includere path completo nell'embedding
**Demo:** Nuovo embedding model produce risultati più pertinenti per codice sorgente

## Must-Haves

- Not provided.

## Proof Level

- This slice proves: Not provided.

## Integration Closure

Not provided.

## Verification

- Not provided.

## Tasks

- [x] **T01: Sostituire modello embedding con codebert/unixcoder** `est:3h`
  Rimuovere all-MiniLM-L6-v2 e integrare un embedding model più adatto al codice.

Steps:
1. Verificare modelli disponibili: ollama list
2. Valutare codebert vs unixcoder per qualità codice → scegliere codebert
3. Integrare embedding tramite @xenova/transformers o modello locale
4. Se xenova non è in package.json, valutarne l'aggiunta come dipendenza leggera
5. Testare embedding su snippet di codice

Files: index.js, package.json (forse)
Verify: verificare che il modello si carichi senza errore
  - Files: `index.js`, `package.json`
  - Verify: node -e "test load embedding model" → senza errori

- [x] **T02: Aggiornare embeddingDimensions a 768** `est:1h`
  Aggiornare tutte le referenze da 384 (MiniLM) a 768.

Steps:
1. grep -r 'embeddingDimensions' in tutta la codebase
2. Aggiornare valore in index.js e gsd-qdrant-mcp/index.js
3. Aggiornare definizione collection Qdrant (dimension: 768)
4. Re-indicizzare i dati esistenti
5. Verificare che nessuna query fallisca per mismatch dimensionale

Files: index.js, src/gsd-qdrant-mcp/index.js
Verify: nessun '384' in src/; almeno 2 occorrenze di '768'
  - Files: `index.js`, `src/gsd-qdrant-mcp/index.js`
  - Verify: grep -r '384' src/ → 0 occorrenze; grep -r '768' src/ ≥ 2

- [x] **T03: Migliorare buildCodeText per dare peso a signature/exports/imports** `est:2h`
  Modificare la funzione buildCodeText per dare priorità a signatures, exports e imports.

Steps:
1. Trovare buildCodeText in index.js
2. Prependere: 'SIGNATURES: sig1 | sig2 || EXPORTS: exp1 || IMPORTS: imp1 ||' al testo originale
3. Mantenere lunghezza ragionevole per non saturare il modello
4. Testare con codice reale

Files: index.js (funzione buildCodeText)
Verify: confrontare embedding di codice con vs senza weighting
  - Files: `index.js`
  - Verify: node src/cli.js context 'implementare auth middleware' → trova file con signature/exports

- [x] **T04: Includere percorso completo file nell'embedding** `est:1h`
  Aggiungere il path completo del file come prefix alla stringa di embedding.

Steps:
1. Trovare dove viene costruita la stringa di embedding per documents type=code
2. Prependere: `${filePath}\n---\n${content}` oppure formato simile
3. Verificare che il path sia incluso ma non domini l'embedding
4. Testare con query contenenti nomi di file specifici

Files: index.js (funzione buildCodeText)
Verify: 'src/hooks/post-commit.sh' → trova quel file specifico
  - Files: `index.js`
  - Verify: node src/cli.js context 'src/hooks/post-commit'

## Files Likely Touched

- index.js
- package.json
- src/gsd-qdrant-mcp/index.js
