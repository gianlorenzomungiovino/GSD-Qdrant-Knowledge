---
estimated_steps: 9
estimated_files: 2
skills_used: []
---

# T02: Aggiornare embeddingDimensions a 768

Aggiornare tutte le referenze a embeddingDimensions da 384 (MiniLM) a 768.

Steps:
1. Cercare 'embeddingDimensions' in tutta la codebase
2. Aggiornare valore in index.js e gsd-qdrant-mcp/index.js
3. Aggiornare la definizione della collection Qdrant se necessaria (dimension: 768)
4. Re-indicizzare i dati esistenti per adattarli alle nuove dimensioni
5. Verificare che nessuna query fallisca per mismatch dimensionale

Files likely touched: `index.js`, `src/gsd-qdrant-mcp/index.js`
Verify: console.log('dimensions: 768') prima di ogni embedding

## Inputs

- `index.js`
- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `embeddingDimensions = 768 ovunque; collection Qdrant aggiornata`

## Verification

grep -r '384' src/ → zero occorrenze; grep -r '768' src/ → almeno 2 occorrenze (config + collection); node src/cli.js context test → nessun errore dimensionale
