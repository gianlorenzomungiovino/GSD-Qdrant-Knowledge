---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T04: Calcolare token estimation e troncare se >4000

Aggiungere stima dei token prima di restituire risultati a GSD/agent.

Steps:
1. Creare funzione `estimateTokens(text)` → ~4 char per token (approssimazione conservativa)
2. Dopo il re-ranking, calcolare somma totale dei chunk.text in caratteri
3. Se tokens > 4000 → troncamento: mantenere solo top K risultati e truncare text ai primi 500 chars
4. Log: `console.log('[retrieval] %d results, ~%d estimated tokens, trimmed to %d', ...)`
5. Integrare in gsd-qdrant-mcp/index.js come ultimo step prima del return

Files: src/gsd-qdrant-mcp/index.js, src/re-ranking.js (utility)
Verify: query che restituisce >4000 token → output ≤4000; query piccola → nessun troncamento

## Inputs

- `src/gsd-qdrant-mcp/index.js`
- `src/re-ranking.js`

## Expected Output

- `estimateTokens() integrata in auto_retrieve; troncamento a 4000`

## Verification

node src/cli.js context 'best practices web development' → verificare output ≤4000 token
