---
estimated_steps: 13
estimated_files: 1
skills_used: []
---

# T01: Implementare cache in memoria Map con TTL 5 minuti

Creare un modulo di caching in-memory che memorizza i risultati delle query Qdrant.

Steps:
1. Creare `src/query-cache.js` (nuovo modulo)
esportante: - `QueryCache.get(key)` → risultato o undefined
- `QueryCache.set(key, value)` → memorizza con timestamp
- `QueryCache.has(key)` → verifica presenza senza update TTL
- `QueryCache.clear()` → svuota tutto
2. Internamente usare Map + setInterval(5*60*1000) per sweep dei vecchi entry
3. Max cache size: 100 entries per evitare memory leak
4. Log: `console.log('[cache] hit=%d, miss=%d', hits, misses);`
5. Integrare in gsd-qdrant-mcp/index.js come primo step della pipeline di retrieval

Files likely touched: `src/query-cache.js` (new), `src/gsd-qdrant-mcp/index.js`
Verify: eseguire query due volte; la seconda dovrebbe essere cache hit

## Inputs

- None specified.

## Expected Output

- `src/query-cache.js con TTL map cache`

## Verification

node -e "const Cache = require('./src/query-cache'); Cache.set('test', 'data'); console.log(Cache.get('test'));" → stampa 'data'; setTimeout(300ms); console.log(Cache.has('test')) → true; dopo 5min → false
