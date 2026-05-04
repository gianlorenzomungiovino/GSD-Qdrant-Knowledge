# S04: Cache Query e Normalizzazione (Fase 4) — UAT

**Milestone:** M005
**Written:** 2026-04-28T10:19:21.335Z

# UAT — Slice S04: Cache Query e Normalizzazione

## Scenario 1: Cache hit su query ripetuta

**Precondizioni:** Server Qdrant non necessario (cache serve prima di chiamare Qdrant)

| Step | Azione | Risultato Atteso |
|------|--------|-----------------|
| 1 | `node -e "const {cache}=require('./src/query-cache'); cache.clear(); cache.resetStats(); cache.set('buildCodeText\|3', [{score:0.9}]); console.log(cache.get('buildcodetext\|3'));"` | Restituisce `[ { score: 0.9 } ]` — hit su chiave normalizzata |
| 2 | `node -e "const {cache}=require('./src/query-cache'); cache.clear(); cache.resetStats(); cache.set('k','v1'); console.log(cache.getStats());"` | Stats mostra hits=0, misses=0 prima del get; dopo il get: hits=1 |

## Scenario 2: Normalizzazione case-insensitive

**Precondizioni:** Cache vuota

| Step | Azione | Risultato Atteso |
|------|--------|-----------------|
| 1 | `cache.set('Implementare Checkout', {result:'data'})` | Entry memorizzata con chiave normalizzata 'implementare checkout' |
| 2 | `cache.get('implementare checkout')` | Restituisce `{ result: 'data' }` — stessa entry del passo 1 |
| 3 | `cache.get('IMPLEMENTARE CHECKOUT')` | Restituisce la stessa entry — normalizzazione lowercase applicata |

## Scenario 3: Stopword removal EN e IT

**Precondizioni:** Nessuna (funzione pura)

| Step | Azione | Risultato Atteso |
|------|--------|-----------------|
| 1 | `normalizeQuery('the is a query for results')` | Restituisce `'query results'` — stopwords EN rimosse |
| 2 | `normalizeQuery('cerca nel database i documenti della sezione')` | Restituisce `'cerca database documenti sezione'` — preposizioni IT rimosse |
| 3 | `normalizeQuery('Implementare Checkout')` | Restituisce `'implementare checkout'` — lowercase applicato, nessuna stopword presente |

## Scenario 4: Symbol boost su match esatto

**Precondizioni:** Import applySymbolBoost e extractTokens da src/re-ranking.js

| Step | Azione | Risultato Atteso |
|------|--------|-----------------|
| 1 | `applySymbolBoost([{score:0.5,symbolNames:['buildCodeText']}], 'implementare build')` | Score diventa 0.75 (×1.5) — token 'build' matcha substring in 'buildCodeText' |
| 2 | `extractTokens('the is a query for buildCodeText')` | Restituisce array senza 'the', con token contenente 'build' |

## Scenario 5: Cache eviction e TTL

**Precondizioni:** Cache vuota, reset stats

| Step | Azione | Risultato Atteso |
|------|--------|-----------------|
| 1 | Inserire >100 entry nella cache | Le prime entry vengono evittate (LRU) — max size enforced |
| 2 | `cache.clear()` | Tutte le entry rimosse, stats resettate |

## Scenario 6: Integrazione MCP server

**Precondizioni:** Progetto installato con tutte le dipendenze

| Step | Azione | Risultato Atteso |
|------|--------|-----------------|
| 1 | `node -e "require('./src/gsd-qdrant-mcp/index.js')"` | Nessun errore — server si carica correttamente con cache integrata |
