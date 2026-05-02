---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T02: Implementare re-ranking con boost recency

Creare funzione di re-ranking che aggiorna gli score Qdrant basandosi su lastModified.

Steps:
1. Creare `src/re-ranking.js` esportante `applyRecencyBoost(results, days=30)`
2. Per ogni risultato con lastModified > Date.now() - (days * 86400000) → score += 0.05
3. Cap max score a 1.0
4. Includere path matching nella stessa funzione: se query contiene parole del path → +0.15 al risultato
5. Log: `console.log('[rerank] %d results scored, avg boost: %.3f', count, avgBoost);`

Files: src/re-ranking.js (new), cli.js o gsd-qdrant-mcp (call site)
Verify: toccare file e verificare che la stessa query lo restituisca più in alto dopo re-ranking

## Inputs

- `index.js`
- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `src/re-ranking.js con applyRecencyBoost(pathMatch=true)`

## Verification

touch src/intent-detector.js; node src/cli.js context 'intent detector' → intent-detector dovrebbe apparire top 3 per recency
