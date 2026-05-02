---
id: T02
parent: S04
milestone: M005
key_files:
  - src/query-cache.js — aggiunta normalizeQuery() con stopwords EN+IT, integrazione in get/set/has
  - src/gsd-qdrant-mcp/index.js — import destrutturato { cache }
key_decisions:
  - Stopwords EN+IT unite in un singolo Set per deduplicazione e O(1) lookup
  - Split su regex [\s\-_]+ per normalizzare anche hyphen/underscore come separatori di token
  - normalizeQuery() restituisce '' per input vuoto/all-stopword, get()/set() gestiscono '' come miss (no cache entry per query vuote)
  - Esportazione destrutturata { cache, normalizeQuery } invece di default export singleton
duration: 
verification_result: passed
completed_at: 2026-04-28T09:45:28.290Z
blocker_discovered: false
---

# T02: Implementata funzione normalizeQuery() con stopwords EN+IT integrata in get/set/has del cache singleton

**Implementata funzione normalizeQuery() con stopwords EN+IT integrata in get/set/has del cache singleton**

## What Happened

Ho implementato la normalizzazione delle query prima dei lookup in cache. La funzione `normalizeQuery(query)` applica una pipeline di 3 step: lowercase → split su whitespace/hyphen/underscore → filtro stopwords → join con spazi. Ho aggiunto due set di stopwords (EN e IT) che vengono uniti in un unico set deduplicato per O(1) lookup. Le stopwords inglesi coprono ~60 termini comuni (articoli, preposizioni, ausiliari, congiunzioni). Quelle italiane coprono ~75 termini tra articoli, preposizioni articolate complete (del/dello/della/nel/nello/sul/col/al + tutte le combinazioni), preposizioni semplici, pronomi e congiunzioni. La normalizzazione è integrata in tutti i metodi del cache: `get()`, `set()` e `has()` chiamano ora `normalizeQuery(key)` prima di accedere allo store Map. Ho anche aggiornato l'import nel MCP server (`src/gsd-qdrant-mcp/index.js`) per usare la nuova esportazione destrutturata `{ cache }` invece del default export. Due fix minori: corretto "cologlio" (non italiano) e aggiunto "colla" su richiesta dell'utente (forma contratta valida con+la).

## Verification

Test di normalizzazione: 'Implementare Checkout' → 'implementare checkout'. Test cache case-insensitive: set('Implementare Checkout', data) + get('implementare checkout') restituisce la stessa entry. Stopwords EN: 'the is a query for results' → 'query results'. Stopwords IT: 'cerca nel database i documenti della sezione' → 'cerca database documenti sezione'. Edge case whitespace-only → empty string. Query all-stopword → cache miss (normalized to ''). MCP server loads cleanly with destructured import.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node -e "const {cache,normalizeQuery}=require('./src/query-cache'); cache.clear(); cache.resetStats(); cache.set('Implementare Checkout',{result:'checkout-data'}); const hit=cache.get('implementare checkout'); console.assert(hit&&hit.result==='checkout-data','FAIL');"` | 0 | ✅ pass | 45ms |
| 2 | `node -e "const {normalizeQuery}=require('./src/query-cache'); console.assert(normalizeQuery('the is a query for results')==='query results','EN FAIL'); console.log(normalizeQuery('cerca nel database i documenti della sezione'));"` | 0 | ✅ pass | 38ms |

## Deviations

Nessuna. L'implementazione segue esattamente il task plan: funzione normalizeQuery in query-cache.js, pipeline lowercase→split→filter stopwords→join, stopwords EN+IT integrate, log console.log('[cache] normalized') presente, verifica case-insensitive passata. Unica aggiunta non prevista ma necessaria: aggiornamento dell'import nel MCP server per supportare la nuova esportazione destrutturata { cache }.

## Known Issues

Nessuno.

## Files Created/Modified

- `src/query-cache.js — aggiunta normalizeQuery() con stopwords EN+IT, integrazione in get/set/has`
- `src/gsd-qdrant-mcp/index.js — import destrutturato { cache }`
