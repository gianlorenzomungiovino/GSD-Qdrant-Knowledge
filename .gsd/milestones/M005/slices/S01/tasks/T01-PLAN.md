---
estimated_steps: 9
estimated_files: 2
skills_used: []
---

# T01: Implementare prefetch di Qdrant

Sostituire la singola query `search()` con batch `prefetch[]` nel modulo di ricerca.

Steps:
1. Leggere il file di ricerca attuale (cli.js / gsd-qdrant-mcp) per identificare la chiamata Qdrant search()
2. Sostituire con prefetch: eseguire prima una query breadth su vector, poi rifinire con top_k stretto
3. Mantenere compatibilità API MCP server auto_retrieve
4. Aggiungere log per debug:
   `console.log('[qdrant] prefetch: %d results in %dms', results.length, elapsed);`

Files: src/cli.js, src/gsd-qdrant-mcp/index.js
Verify: `node src/cli.js context "come implementare checkout"` deve restituire risultati via prefetch

## Inputs

- `src/cli.js`
- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `Modifica funzione search → prefetch nel modulo di query Qdrant`

## Verification

node src/cli.js context "come implementare checkout ecommerce"
