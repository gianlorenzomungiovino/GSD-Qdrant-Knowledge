---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T01: Aggiungere funzioni di estrazione parole chiave (extractKeywordsFromTask)

Implementare la funzione extractKeywordsFromTask che usa pattern matching per estrarre parole chiave rilevanti dal task dell'utente. Supporta categorie: autenticazione, componenti, API, database, form.

## Inputs

- `src/gsd-qdrant-mcp/index.js (file esistente)`

## Expected Output

- `Funzione extractKeywordsFromTask esportata e funzionante`

## Verification

node -e "const { extractKeywordsFromTask } = require('./src/gsd-qdrant-mcp/index.js'); console.log(extractKeywordsFromTask('implementiamo autenticazione JWT'))"
