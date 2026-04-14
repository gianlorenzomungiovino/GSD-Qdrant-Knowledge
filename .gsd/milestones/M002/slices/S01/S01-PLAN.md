# S01: Implementazione tool auto_retrieve

**Goal:** Implementare lo strumento MCP `auto_retrieve` con funzioni di estrazione parole chiave e generazione query automatiche
**Demo:** L'MCP server ha un nuovo strumento `auto_retrieve` che estrae automaticamente parole chiave dal task e fa retrieval su Qdrant

## Must-Haves

- Not provided.

## Proof Level

- This slice proves: Not provided.

## Integration Closure

Not provided.

## Verification

- Not provided.

## Tasks

- [x] **T01: Aggiungere funzioni di estrazione parole chiave (extractKeywordsFromTask)** `est:10-15 min`
  Implementare la funzione extractKeywordsFromTask che usa pattern matching per estrarre parole chiave rilevanti dal task dell'utente. Supporta categorie: autenticazione, componenti, API, database, form.
  - Files: `src/gsd-qdrant-mcp/index.js`
  - Verify: node -e "const { extractKeywordsFromTask } = require('./src/gsd-qdrant-mcp/index.js'); console.log(extractKeywordsFromTask('implementiamo autenticazione JWT'))"

- [x] **T02: Aggiungere funzione di generazione query (generateSearchQueries)** `est:5-10 min`
  Implementare la funzione generateSearchQueries che genera 1-2 query di ricerca ottimali dalle parole chiave estratte, evitando sovraccarico del database.
  - Files: `src/gsd-qdrant-mcp/index.js`
  - Verify: node -e "const { generateSearchQueries } = require('./src/gsd-qdrant-mcp/index.js'); console.log(generateSearchQueries(['autenticazione', 'JWT']))"

- [x] **T03: Aggiungere strumento MCP auto_retrieve** `est:20-30 min`
  Implementare il nuovo strumento MCP 'auto_retrieve' che combina le due funzioni sopra, esegue retrieval su Qdrant e restituisce risultati con metadata + contenuto completo per il top-1 risultato.
  - Files: `src/gsd-qdrant-mcp/index.js`
  - Verify: mcp_call(server='gsd-qdrant', tool='auto_retrieve', args={task: 'implementiamo autenticazione JWT'})

## Files Likely Touched

- src/gsd-qdrant-mcp/index.js
