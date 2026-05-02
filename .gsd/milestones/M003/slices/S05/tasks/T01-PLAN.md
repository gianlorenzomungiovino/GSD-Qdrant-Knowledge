---
estimated_steps: 11
estimated_files: 2
skills_used: []
---

# T01: Implementare prefetch di Qdrant

Sostituire la singola query `search()` con batch `prefetch[]` nel modulo di ricerca (cli.js o query module).

Steps:
1. Leggere il file di ricerca attuale per identificare la chiamata Qdrant search()
2. Sostituire con prefetch: eseguire prima una query breadth su vector, poi rifinire con top_k stretto
3. Mantenere compatibilità API MCP server auto_retrieve
4. Aggiungere log per debug:
   ```js
   console.log('[qdrant] prefetch: %d results in %dms', results.length, elapsed);
   ```

Files likely touched: `src/cli.js`, `src/gsd-qdrant-mcp/index.js`
Verify: `node src/cli.js context "come implementare checkout"` deve restituire risultati via prefetch

## Inputs

- `src/cli.js`
- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `Modifica funzione search → prefetch nel modulo di query Qdrant`

## Verification

node src/cli.js context "come implementare checkout ecommerce" 2>&1 | grep -i prefetch || console.log nel log indica prefetch attivo; numero risultati ≤10 (pre-filter breadth)
