# S05: Perfezionamento Query Qdrant (Fase 1)

**Goal:** Raffinare la query su Qdrant per restituire meno risultati ma più pertinenti: prefetch al posto di search singola, filtri must senza should, group_by per documento, limit ridotto con soglia
**Demo:** La ricerca restituisce massimo 5 chunk per documento sorgente con soglia di rilevanza >0.85, usando prefetch e group_by di Qdrant

## Must-Haves

- Not provided.

## Proof Level

- This slice proves: Not provided.

## Integration Closure

Not provided.

## Verification

- Log query refinement: '[qdrant] prefetch:', '[qdrant] filter:', '[qdrant] group_by:', '[qdrant] results:' — grepabili per debugging performance

## Tasks

- [ ] **T01: Implementare prefetch di Qdrant** `est:2h`
  Sostituire la singola query `search()` con batch `prefetch[]` nel modulo di ricerca (cli.js o query module).

Steps:
1. Leggere il file di ricerca attuale per identificare la chiamata Qdrant search()
2. Sostituire con prefetch: eseguire prima una query breadth su vector, poi rifinire con top_k stretto
3. Mantenere compatibilità API MCP server auto_retrieve
4. Aggiungere log per debug:
   ```js
   console.log('[qdrant] prefetch: %d results in %dms', results.length, elapsed);
   ```

Files likely touched: `src/cli.js`, `src/gsd-qdrant-mcp/index.js`
Verify: `node src/cli.js context "come implementare checkout"` deve restituire risultati via prefetch
  - Files: `src/cli.js`, `src/gsd-qdrant-mcp/index.js`
  - Verify: node src/cli.js context "come implementare checkout ecommerce" 2>&1 | grep -i prefetch || console.log nel log indica prefetch attivo; numero risultati ≤10 (pre-filter breadth)

- [ ] **T02: Convertire filtri should→must quando intento è certo** `est:1.5h`
  Modificare `src/intent-detector.js` per convertire i payload di filtro Qdrant da `should` (soft) a `must` (hard) quando l'intento identifica tipo, linguaggio o progetto con certezza.

Steps:
1. Leggere intent-detector.js per capire come costruisce il filter_payload
2. Quando type/language/project hanno valore certo → usare must[] invece di should[]
3. Mantenere should[] solo per query ambigue (intent non definito)
4. Aggiungere log: `console.log('[qdrant] filter: must=%d, should=%d', must.length, should.length);`

Files likely touched: `src/intent-detector.js`
Verify: query specifica 'Node.js async/await pattern' deve filtrare per language=node e type=code (must)
  - Files: `src/intent-detector.js`
  - Verify: Verificare che intent-detector restituisca filter con must[] per intents noti; node src/cli.js context 'Node.js async pattern' non dovrebbe restituire risultati JS se language=node è certo

- [ ] **T03: Implementare group_by max 2 chunk per documento** `est:1.5h`
  Aggiungere `group_by` alla query Qdrant per restituire massimo 1-2 chunk per documento sorgente.

Steps:
1. Nella chiamata Qdrant (dopo prefetch), aggiungere `group_by: 'source_doc_path'` con `group_size: 2`
2. Mantenere `limit: 5` globale ma limitato ai chunk raggruppati
3. Gestire caso dove group_size > available_chunks per un documento
4. Log: `console.log('[qdrant] group_by: source=%d, chunks=%d', groups.length, totalChunks);`

Files likely touched: `src/cli.js`, `src/gsd-qdrant-mcp/index.js`
Verify: stessa query 3 volte deve restituire chunk da documenti diversi (no duplicati)
  - Files: `src/cli.js`, `src/gsd-qdrant-mcp/index.js`
  - Verify: node src/cli.js context 'embedding model comparison' → verificare che non ci siano più di 2 chunk dallo stesso file sorgente; numero documenti unici ≥3

- [ ] **T04: Ridurre limit da 10 a 5 con soglia rilevanza >0.85** `est:1h`
  Aggiornare i parametri di default della ricerca: ridurre `limit` da 10 a 5 e aggiungere threshold di score minimo.

Steps:
1. Modificare il parametro `limit: 10` → `limit: 5` in tutti i punti di query (cli.js, gsd-qdrant-mcp)
2. Filtrare risultati con `score >= 0.85` dopo la query Qdrant
3. Se meno di 2 risultati oltre la soglia, fare ricerca fallback con threshold 0.75
4. Log: `console.log('[qdrant] results: %d total, %d above threshold 0.85', total, filtered.length);`

Files likely touched: `src/cli.js`, `src/gsd-qdrant-mcp/index.js`
Verify: query generiche restituiscono max 5 chunk; verificare soglia con query ambigue
  - Files: `src/cli.js`, `src/gsd-qdrant-mcp/index.js`
  - Verify: node src/cli.js context 'tools for building web apps' → risultato ≤5 chunk; eseguire con threshold=0.75 fallback e verificare che almeno 2 risultati appaiano

## Files Likely Touched

- src/cli.js
- src/gsd-qdrant-mcp/index.js
- src/intent-detector.js
