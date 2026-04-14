---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: Testare estrazione parole chiave e generazione query

Testare le funzioni implementate con diversi tipi di task per garantire che estraggano correttamente le parole chiave e generino query appropriate.

## Inputs

- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `Funzioni funzionanti con diversi tipi di task`
- `Estrazione corretta per autenticazione, componenti, API`

## Verification

node -e "const { extractKeywordsFromTask, generateSearchQueries } = require('./src/gsd-qdrant-mcp/index.js'); console.log('Test 1:', extractKeywordsFromTask('creiamo un nuovo componente Hero')); console.log('Test 2:', extractKeywordsFromTask('implementiamo API per gestione utenti')); console.log('Test 3:', generateSearchQueries(['componente', 'Hero']))"
