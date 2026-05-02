# S06: Ottimizzazione Embedding (Fase 2)

**Goal:** Sostituire all-MiniLM-L6-v2 con codebert o unixcoder (768 dim), aggiornare embeddingDimensions, migliorare buildCodeText per dare peso a signature/exports/imports/inizio file, includere path completo nell'embedding
**Demo:** Nuovo embedding model produce risultati più pertinenti per codice sorgente

## Must-Haves

- Not provided.

## Proof Level

- This slice proves: Not provided.

## Integration Closure

Not provided.

## Verification

- Log embedding: '[embedding] model: codebert, dims: 768, tokens: %d'; '[codeText] path: %s, length: %d' — grepabili per verificare modello e dimensioni

## Tasks

- [ ] **T01: Sostituire modello embedding con codebert/unixcoder** `est:3h`
  Rimuovere all-MiniLM-L6-v2 e integrare un embedding model più adatto al codice sorgente.

Steps:
1. Verificare quali modelli sono disponibili localmente: ollama list
2. Valutare codebert (Microsoft) vs unixcoder (NVIDIA) per qualità codice → scegliere codebert
3. Integrare l'embedding tramite `@xenova/transformers` o embedding model locale
4. Se xenova non è in package.json, valutarne l'aggiunta come dipendenza leggera
5. Testare embedding su snippet di codice e confrontare con MiniLM esistente

Files likely touched: `index.js`, `package.json`
Verify: verificare che il modello si carichi senza errore
  - Files: `index.js`, `package.json`
  - Verify: node -e "const { pipeline } = require('@xenova/transformers'); console.log('pipeline loaded');"; ollama run codebert --test (se Ollama locale)

- [ ] **T02: Aggiornare embeddingDimensions a 768** `est:1h`
  Aggiornare tutte le referenze a embeddingDimensions da 384 (MiniLM) a 768.

Steps:
1. Cercare 'embeddingDimensions' in tutta la codebase
2. Aggiornare valore in index.js e gsd-qdrant-mcp/index.js
3. Aggiornare la definizione della collection Qdrant se necessaria (dimension: 768)
4. Re-indicizzare i dati esistenti per adattarli alle nuove dimensioni
5. Verificare che nessuna query fallisca per mismatch dimensionale

Files likely touched: `index.js`, `src/gsd-qdrant-mcp/index.js`
Verify: console.log('dimensions: 768') prima di ogni embedding
  - Files: `index.js`, `src/gsd-qdrant-mcp/index.js`
  - Verify: grep -r '384' src/ → zero occorrenze; grep -r '768' src/ → almeno 2 occorrenze (config + collection); node src/cli.js context test → nessun errore dimensionale

- [ ] **T03: Migliorare buildCodeText per dare peso a signature/exports/imports** `est:2h`
  Modificare la funzione buildCodeText per dare priorità a signature, exports e imports nel testo di embedding.

Steps:
1. Trovare la funzione buildCodeText in index.js o modulo correlato
2. Analizzare come costruisce il testo corrente
3. Modificare per ripetere signatures/exports all'inizio della stringa (peso posizionale)
4. Esempio: prepend `SIGNATURES: ${sig1} | ${sig2} || EXPORTS: ${exp1} | ${exp2} || ` al testo originale
5. Mantenere la lunghezza ragionevole per non saturare il modello

Files likely touched: `index.js` (funzione buildCodeText)
Verify: confrontare embedding di codice con vs senza weighting → verificare differenza nei risultati di ricerca
  - Files: `index.js`
  - Verify: node src/cli.js context 'implementare auth middleware' → deve trovare file con middleware signature/exports prima di file generici; console.log del testo buildCodeText per verificare ripetizioni signatures

- [ ] **T04: Includere percorso completo file nell'embedding** `est:1h`
  Aggiungere il path completo del file come prefix alla stringa di embedding.

Steps:
1. Trovare dove viene costruita la stringa di embedding per i documenti type=code
2. Prependere il percorso completo: `${filePath}
---
${content}` oppure `${filePath}: ${sig}
${content}`
3. Testare che il path sia incluso ma non domini l'embedding (non troppo lungo)
4. Verificare con query che contengano nomi di file specifici

Files likely touched: `index.js` (funzione buildCodeText o equivalente)
Verify: node src/cli.js context 'src/hooks/post-commit.sh' → deve trovare quel file specifico
  - Files: `index.js`
  - Verify: node src/cli.js context 'src/hooks/post-commit' → risultato contiene post-commit; verificare nel log il testo dell'embedding per conferma del path prefix

## Files Likely Touched

- index.js
- package.json
- src/gsd-qdrant-mcp/index.js
