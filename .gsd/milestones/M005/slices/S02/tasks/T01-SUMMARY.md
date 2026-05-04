---
id: T04
parent: S03
milestone: M005
key_files:
  - src/gsd-qdrant-mcp/index.js — token estimation e troncamento integrato in auto_retrieve tool
duration: 
verification_result: passed
completed_at: 2026-04-27T17:10:00.000Z
blocker_discovered: false
---

# T04: Integrare token estimation e troncamento in MCP auto_retrieve tool

**Stima token (~4 chars/token) + troncamento a 500 char per risultato — output limitato a ~4000 token totali nel server MCP**

## What Happened

Analisi del auto_retrieve tool in gsd-qdrant-mcp/index.js: i risultati venivano restituiti senza limiti di dimensione, consumando molti tokens nel prompt dell'agent.

Modifica implementata:
1. estimateTokens() applica un ratio conservativo di ~4 chars/token per code/text mix.
2. trimResultsByTokenBudget() tronca content/summary a 500 char quando il totale supera 4000 token.
3. Flag interno `_truncated` rimosso prima della serializzazione JSON.

Verifica: testata con 6 scenari unitari — risultati piccoli (pass through), risultati grandi (>4000 tokens, trimmed), array vuoto, null handling. Tutti producono output corretto senza errori.