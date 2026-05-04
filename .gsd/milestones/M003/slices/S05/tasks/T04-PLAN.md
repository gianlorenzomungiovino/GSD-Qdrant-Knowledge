---
estimated_steps: 8
estimated_files: 2
skills_used: []
---

# T04: Ridurre limit da 10 a 5 con soglia rilevanza >0.85

Aggiornare i parametri di default della ricerca: ridurre `limit` da 10 a 5 e aggiungere threshold di score minimo.

Steps:
1. Modificare il parametro `limit: 10` → `limit: 5` in tutti i punti di query (cli.js, gsd-qdrant-mcp)
2. Filtrare risultati con `score >= 0.85` dopo la query Qdrant
3. Se meno di 2 risultati oltre la soglia, fare ricerca fallback con threshold 0.75
4. Log: `console.log('[qdrant] results: %d total, %d above threshold 0.85', total, filtered.length);`

Files likely touched: `src/cli.js`, `src/gsd-qdrant-mcp/index.js`
Verify: query generiche restituiscono max 5 chunk; verificare soglia con query ambigue

## Inputs

- `src/cli.js`
- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `limit: 5, threshold >= 0.85 (fallback 0.75) nei parametri di ricerca`

## Verification

node src/cli.js context 'tools for building web apps' → risultato ≤5 chunk; eseguire con threshold=0.75 fallback e verificare che almeno 2 risultati appaiano
