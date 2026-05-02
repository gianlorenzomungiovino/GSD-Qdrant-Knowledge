---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T04: Calcolare token estimation e troncare se >4000

Aggiungere stima dei token prima di restituire risultati a GSD/agent.

Steps:
1. Creare funzione `estimateTokens(text)` semplice: ~4 char per token (approssimazione conservativa)
2. Dopo il re-ranking, calcolare somma totale dei chunk.text in caratteri
3. Se tokens > 4000 → troncamento: mantenere solo top K risultati e truncare text di ogni chunk ai primi 500 chars
4. Log: `console.log('[retrieval] %d results, ~%d estimated tokens, trimmed to %d', total, estTokens, finalCount);`
5. Integrare nella funzione auto_retrieve (gsd-qdrant-mcp/index.js) come ultimo step prima del return

Files likely touched: `src/gsd-qdrant-mcp/index.js`, `src/re-ranking.js` (nuova utility)
Verify: eseguire query che restituisce >4000 token stimati e verificare troncamento; esecuzione con query piccola verifica nessun troncamento

## Inputs

- `src/gsd-qdrant-mcp/index.js`
- `src/re-ranking.js`

## Expected Output

- `funzione estimateTokens() integrata in auto_retrieve; troncamento a 4000 token`

## Verification

node src/cli.js context 'best practices web development' → se totale >4000 token, verificare che output sia ≤4000; console.log conferma '[retrieval] ... trimmed to'
