---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T02: Implementare re-ranking con boost recency

Creare funzione di re-ranking che aggiorna gli score Qdrant basandosi su lastModified.

Steps:
1. Creare `src/re-ranking.js` (nuovo modulo) esportante `applyRecencyBoost(results, days = 30)`
2. Per ogni risultato con `lastModified > Date.now() - (days * 86400000)` → score += 0.05
3. Cap il max score a 1.0 per evitare overflow
4. Includere path matching: se query contiene parole del path (es. 'components', 'hooks') → +0.15 al risultato
5. Log: `console.log('[rerank] %d results scored, avg boost: %.3f', count, avgBoost);`

Files likely touched: `src/re-ranking.js` (new), `src/cli.js` o `gsd-qdrant-mcp/index.js` (call site)
Verify: toccare un file (`git touch`) e verificare che la stessa query lo restituisca più in alto dopo re-ranking

## Inputs

- `index.js`
- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `src/re-ranking.js con applyRecencyBoost(pathMatch=true)`

## Verification

touch src/intent-detector.js; node src/cli.js context 'intent detector' → intent-detector dovrebbe apparire in top 3 per recency boost (+0.05)
