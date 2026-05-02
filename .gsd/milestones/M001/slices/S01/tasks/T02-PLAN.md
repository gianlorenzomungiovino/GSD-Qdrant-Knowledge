---
estimated_steps: 6
estimated_files: 1
skills_used: []
---

# T02: Aggiungere funzione di generazione query (generateSearchQueries)

Limitare le query massimizza l'efficienza del retrieval e previene sovraccarico del database Qdrant

**Steps:**
1. Aggiungere la funzione `generateSearchQueries`
2. Se keywords.length === 0, usare il task intero come fallback
3. Se keywords.length === 1, usare la singola keyword
4. Se keywords.length >= 2, generare [keywords[0], keywords[0] + ' ' + keywords[1]] (max 2 query)

## Inputs

- None specified.

## Expected Output

- `src/gsd-qdrant-mcp/index.js`

## Verification

node -e "const {generateSearchQueries} = require('./src/gsd-qdrant-mcp/index.js'); const q = generateSearchQueries(['autenticazione', 'JWT', 'oauth']); if (q.length === 2 && q[0] === 'autenticazione' && q[1] === 'autenticazione JWT') { console.log('PASS'); process.exit(0); } else { console.log('FAIL: expected 2 queries'); process.exit(1); }"
