---
estimated_steps: 8
estimated_files: 2
skills_used: []
---

# T04: Ridurre limit da 10 a 5 con soglia rilevanza >0.85

Aggiornare i parametri di default: limit: 10 → 5 e aggiungere threshold score minimo.

Steps:
1. Modificare limit in tutti i punti di query
2. Filtrare risultati con score >= 0.85 dopo la query Qdrant
3. Fallback: se <2 risultati oltre soglia, ricerca con threshold 0.75
4. Log: `console.log('[qdrant] results: %d total, %d above threshold', ...)`

Files: src/cli.js, src/gsd-qdrant-mcp/index.js
Verify: query generiche restituiscono max 5 chunk; verificare fallback

## Inputs

- `src/cli.js`
- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `limit: 5, threshold >= 0.85 (fallback 0.75)`

## Verification

node src/cli.js context 'tools for building web apps'
