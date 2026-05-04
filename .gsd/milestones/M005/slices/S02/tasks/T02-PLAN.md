---
estimated_steps: 9
estimated_files: 2
skills_used: []
---

# T02: Aggiornare embeddingDimensions a 768

Aggiornare tutte le referenze da 384 (MiniLM) a 768.

Steps:
1. grep -r 'embeddingDimensions' in tutta la codebase
2. Aggiornare valore in index.js e gsd-qdrant-mcp/index.js
3. Aggiornare definizione collection Qdrant (dimension: 768)
4. Re-indicizzare i dati esistenti
5. Verificare che nessuna query fallisca per mismatch dimensionale

Files: index.js, src/gsd-qdrant-mcp/index.js
Verify: nessun '384' in src/; almeno 2 occorrenze di '768'

## Inputs

- `index.js`
- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `embeddingDimensions = 768 ovunque`

## Verification

grep -r '384' src/ → 0 occorrenze; grep -r '768' src/ ≥ 2
