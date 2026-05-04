# S01: Perfezionamento Query Qdrant (Fase 1)

**Goal:** Raffinare la query su Qdrant: prefetch al posto di search singola, filtri must senza should, group_by per documento, limit ridotto con soglia
**Demo:** La ricerca restituisce massimo 5 chunk per documento sorgente con soglia di rilevanza >0.85

## Must-Haves

- Not provided.

## Proof Level

- This slice proves: Not provided.

## Integration Closure

Not provided.

## Verification

- Not provided.

## Tasks

- [x] **T01: Implementare prefetch di Qdrant** `est:2h`
  Sostituire la singola query `search()` con batch `prefetch[]` nel modulo di ricerca.

Steps:
1. Leggere il file di ricerca attuale (cli.js / gsd-qdrant-mcp) per identificare la chiamata Qdrant search()
2. Sostituire con prefetch: eseguire prima una query breadth su vector, poi rifinire con top_k stretto
3. Mantenere compatibilità API MCP server auto_retrieve
4. Aggiungere log per debug:
   `console.log('[qdrant] prefetch: %d results in %dms', results.length, elapsed);`

Files: src/cli.js, src/gsd-qdrant-mcp/index.js
Verify: `node src/cli.js context "come implementare checkout"` deve restituire risultati via prefetch
  - Files: `src/cli.js`, `src/gsd-qdrant-mcp/index.js`
  - Verify: node src/cli.js context "come implementare checkout ecommerce"

- [x] **T02: Convertire filtri should→must quando intento è certo** `est:1.5h`
  Modificare `src/intent-detector.js` per convertire il payload di filtro Qdrant da `should` (soft) a `must` (hard) quando tipo/linguaggio/progetto hanno valore certo.

Steps:
1. Leggere intent-detector.js per capire come costruisce filter_payload
2. type/language/project con valore certo → must[] invece di should[]
3. Mantenere should[] solo per query ambigue (intent non definito)
4. Log: `console.log('[qdrant] filter: must=%d, should=%d', ...)`

Files: src/intent-detector.js
Verify: 'Node.js async pattern' deve filtrare language=node (must)
  - Files: `src/intent-detector.js`
  - Verify: node src/cli.js context 'Node.js async pattern'

- [x] **T03: Implementare group_by max 2 chunk per documento** `est:1.5h`
  Aggiungere `group_by` alla query Qdrant per restituire max 1-2 chunk per documento sorgente.

Steps:
1. Nella chiamata Qdrant (dopo prefetch), aggiungere group_by: 'source_doc_path' con group_size: 2
2. Mantenere limit: 5 globale ma limitato ai chunk raggruppati
3. Log: `console.log('[qdrant] group_by: groups=%d, chunks=%d', ...)`

Files: src/cli.js, src/gsd-qdrant-mcp/index.js
Verify: stessa query deve restituire chunk da documenti diversi (no duplicati)
  - Files: `src/cli.js`, `src/gsd-qdrant-mcp/index.js`
  - Verify: node src/cli.js context 'embedding model comparison' → doc unici ≥3

- [x] **T04: Ridurre limit da 10 a 5 con soglia rilevanza >0.85** `est:1h`
  Aggiornare i parametri di default: limit: 10 → 5 e aggiungere threshold score minimo.

Steps:
1. Modificare limit in tutti i punti di query
2. Filtrare risultati con score >= 0.85 dopo la query Qdrant
3. Fallback: se <2 risultati oltre soglia, ricerca con threshold 0.75
4. Log: `console.log('[qdrant] results: %d total, %d above threshold', ...)`

Files: src/cli.js, src/gsd-qdrant-mcp/index.js
Verify: query generiche restituiscono max 5 chunk; verificare fallback
  - Files: `src/cli.js`, `src/gsd-qdrant-mcp/index.js`
  - Verify: node src/cli.js context 'tools for building web apps'

## Files Likely Touched

- src/cli.js
- src/gsd-qdrant-mcp/index.js
- src/intent-detector.js
