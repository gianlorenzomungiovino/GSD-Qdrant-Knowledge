---
estimated_steps: 13
estimated_files: 1
skills_used: []
---

# T01: Implementare cache in memoria Map con TTL 5 minuti

Creare `src/query-cache.js` (nuovo modulo) che gestisce la cache dei risultati di query Qdrant.

Steps:
1. Creare src/query-cache.js con classe/methods:
   - QueryCache.get(key) → risultato o undefined
   - QueryCache.set(key, value) → memorizza con timestamp
   - QueryCache.has(key) → verifica presenza senza update TTL
   - QueryCache.clear() → svuota tutto
2. Internamente usare Map + setInterval(5*60*1000) per sweep vecchi entry
3. Max cache size: 100 entries per evitare memory leak
4. Log: `console.log('[cache] hit=%d, miss=%d', hits, misses);`
5. Integrare in gsd-qdrant-mcp/index.js come primo step della pipeline di retrieval

Files: src/query-cache.js (new), src/gsd-qdrant-mcp/index.js
Verify: eseguire query due volte → la seconda dovrebbe essere cache hit

## Inputs

- None specified.

## Expected Output

- `src/query-cache.js con TTL map cache`

## Verification

node -e "const Cache = require('./src/query-cache'); Cache.set('test', 'data'); console.log(Cache.get('test'));" → stampa 'data'
