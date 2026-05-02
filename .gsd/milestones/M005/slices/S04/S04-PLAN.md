# S04: Cache Query e Normalizzazione (Fase 4)

**Goal:** Implementare cache in memoria Map con TTL 5 minuti per query normalizzate, aggiungere normalizzazione (lowercase + stopword removal it/en), boost per match esatto su symbolNames (+0.2)
**Demo:** Query ripetute servite da cache in memoria senza chiamate Qdrant

## Must-Haves

- Not provided.

## Proof Level

- This slice proves: Not provided.

## Integration Closure

Not provided.

## Verification

- Not provided.

## Tasks

- [x] **T01: Implementare cache in memoria Map con TTL 5 minuti** `est:1.5h`
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
  - Files: `src/query-cache.js`
  - Verify: node -e "const Cache = require('./src/query-cache'); Cache.set('test', 'data'); console.log(Cache.get('test'));" → stampa 'data'

- [x] **T02: Normalizzazione query (lowercase + stopword removal)** `est:1h`
  Implementare normalizzazione della query prima del lookup in cache.

Steps:
1. Creare funzione normalizeQuery(query) in query-cache.js o modulo separato
2. Normalizzazione: lowercase → split → filtro stopwords → join
3. Stopwords inglesi: a, an, the, is, are, was, were, for, of, with, on, at, to, from, etc.
4. Stopwords italiane: il, lo, la, i, gli, le, un, uno, una, del, dello, della, dei, degli, delle, in, nel, nello, nella, nei, negli, nelle, etc.
5. Applicare prima del cache lookup: norm = normalizeQuery(original) → Cache.get(norm)
6. Log: `console.log('[cache] normalized: %s → %s', original, norm);`

Files: src/query-cache.js
Verify: 'Implementare Checkout' e 'implementare checkout' → stessa cache entry
  - Files: `src/query-cache.js`
  - Verify: node -e "test normalizeQuery('Implementare Checkout')" → stampa 'implementare checkout'

- [x] **T03: Aggiungere boost per match esatto su symbolNames** `est:1h`
  Implementare il boost +0.2 per risultati che contengono match esatti sui nomi di simboli presenti nella query.

Steps:
1. Dopo la normalizzazione della query, estrarre i token (parole chiave)
2. Per ogni risultato Qdrant con campo symbolNames nel payload: verificare se almeno uno symbolName contiene un token della query (match esatto o substring)
3. Se match trovato → score *= 1.5 (boost ≈ +0.2 per range normalizzato [0,1])
4. Integrare in gsd-qdrant-mcp/index.js come passo dopo re-ranking ma prima di troncamento
5. Log: `console.log('[retrieval] symbolBoost: %d results', boostedCount);`

Files: src/gsd-qdrant-mcp/index.js (punto integrazione), eventualmente src/re-ranking.js per riutilizzare logica
Verify: 'buildCodeText' → risultati con buildCodeText in symbolNames devono avere score più alto
  - Files: `src/gsd-qdrant-mcp/index.js`
  - Verify: node src/cli.js context 'buildCodeText'

## Files Likely Touched

- src/query-cache.js
- src/gsd-qdrant-mcp/index.js
