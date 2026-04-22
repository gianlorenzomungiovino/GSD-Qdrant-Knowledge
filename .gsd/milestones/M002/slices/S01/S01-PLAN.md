# S01: Implementare Ricerca Ibrida (Fase C → Valutazione → Fase A)

**Goal:** Implementare ricerca ibrida in due fasi: Fase C (weighted fusion) come MVP immediato, poi valutazione. Se il miglioramento è sufficiente, si ferma qui. Altrimenti Fase A (dense+sparse RRF nativo Qdrant). Ogni fase include misurazione dei punteggi prima/dopo per validare l'impatto reale.
**Demo:** La ricerca restituisce risultati più precisi combinando similarità vettoriale e match testuale, con benchmark documentato

## Must-Haves

- Baseline misurata con almeno 10 query di test realistiche
- Fase C (weighted fusion) implementata senza modifiche alla collection
- Benchmark eseguito dopo ogni fase con risultati salvati in JSON
- Decisione go/no-go documentata con criteri oggettivi
- Se GO: Fase A implementata con RRF nativo Qdrant e benchmark finale
- Se STOP: Fase A rimossa dal piano, S01 completo con solo C

## Proof Level

- This slice proves: integration + measurement — each phase produces quantitative evidence (score delta, hit rate delta) that proves or disproves the improvement. The go/no-go decision is based on measurable thresholds, not subjective assessment.

## Integration Closure

- Upstream surfaces consumed: src/auto-retrieve-mcp.js (callAutoRetrieve), src/gsd-qdrant-mcp/index.js (auto_retrieve tool, scoring post-search)
- New wiring introduced in this slice: scripts/benchmark-retrieve.js (measurement), lexicalScore() function, optional sparse vector field
- What remains before the milestone is truly usable end-to-end: nothing — the search improvement is validated against baseline

## Verification

- Runtime signals: benchmark script produces structured JSON output
- Inspection surfaces: `node scripts/benchmark-retrieve.js` → baseline-results.json, phase-c-results.json, phase-a-results.json
- Failure visibility: delta score ≤ 0% → fallback to original vector-only search
- Redaction constraints: none

## Tasks

- [ ] **T01: Baseline — misurare punteggi attuali ricerca vettoriale pura** `est:1.5h`
  # Stabilire una baseline quantitativa dei punteggi di ricerca attuali, prima di qualsiasi modifica.

## Steps
1. **Creare script di benchmark**: `scripts/benchmark-retrieve.js` — accetta un array di query di test e restituisce i punteggi medi per top-3 risultati
2. **Selezionare 10-15 query di test realistiche** — derivare da query reali usate in GSD (es. "come configurare auto_retrieve", "errore qdrant collection non trovata", "migliorare precisione embedding")
3. **Eseguire benchmark su ogni query**: lanciare `auto_retrieve` con le stesse query, raccogliere:
   - Score medio dei top-3 risultati
   - Hit rate: % di query dove il risultato rilevante è nei top-3
   - Score del miglior risultato per query
4. **Salvare i risultati** in `.gsd/milestones/M002/slices/S01/baseline-results.json`
5. **Documentare la baseline** nel piano: score medio, hit rate, osservazioni qualitative

## Must-Haves
- [ ] Script di benchmark riutilizzabile (stessa input per tutti i test)
- [ ] Almeno 10 query di test realistiche
- [ ] Risultati salvati in formato JSON strutturato
- [ ] Score medio e hit rate calcolati
  - Files: `scripts/benchmark-retrieve.js`, `.gsd/milestones/M002/slices/S01/baseline-results.json`
  - Verify: node scripts/benchmark-retrieve.js && cat baseline-results.json | grep -E 'average|hitRate'

- [ ] **T02: Fase C — Implementare weighted fusion (vettoriale + filtro testuale)** `est:3h`
  # Implementare una fusione ponderata tra ricerca vettoriale e matching testuale sui payload, senza modificare la collection Qdrant.

## Steps
1. **Analizzare i payload esistenti**: verificare quali campi sono candidati per il matching testuale (source, summary, title, tags, project_id)
2. **Modificare `auto-retrieve-mcp.js`**:
   - Dopo la ricerca vettoriale (`client.search`), aggiungere un secondo step di scoring
   - Per ogni risultato, calcolare un punteggio testuale: TF-lite sul campo `summary` + `source` contro la query
   - Funzione `lexicalScore(query, payload)`: tokenizza query e payload, calcola overlap normalizzato (Jaccard-like o BM25 semplificato)
3. **Fusione ponderata**:
   - `finalScore = vectorScore * 0.65 + lexicalScore * 0.35`
   - Parametri `VECTOR_WEIGHT` e `LEXICAL_WEIGHT` esposti come costanti configurabili all'inizio del file
   - Riordinare i risultati per `finalScore` invece di `score`
4. **Aggiornare il ranking** nel MCP server (`index.js` riga ~60-70), dove viene fatto il scoring post-search
5. **Documentare i parametri**: aggiungere commenti su come tarare i pesi in base al tipo di contenuto

## Must-Haves
- [ ] Funzione `lexicalScore()` indipendente e testabile
- [ ] Pesi configurabili (di default 0.65/0.35)
- [ ] Nessun cambiamento alla collection Qdrant (zero-breaking)
- [ ] I risultati sono ordinati per score ibrido, non solo vettoriale
- [ ] Il matching testuale usa solo payload esistenti (no modifica DB)
  - Files: `src/auto-retrieve-mcp.js`, `src/gsd-qdrant-mcp/index.js`
  - Verify: node scripts/benchmark-retrieve.js && diff baseline-results.json phase-c-results.json | head -20

- [ ] **T03: Fase C — Benchmark post-implementazione e valutazione go/no-go** `est:1h`
  # Misurare l'impatto della weighted fusion e decidere se procedere con la Fase A (RRF nativo) o fermarsi qui.

## Steps
1. **Eseguire lo stesso benchmark** della baseline (T01) con la nuova implementazione
2. **Salvare i risultati** in `phase-c-results.json`
3. **Calcolare il delta**:
   - Δ score medio: (nuovo - vecchio) / vecchio × 100
   - Δ hit rate: differenza percentuale punti
   - Query che hanno migliorato/peggiorato/invariato
4. **Criteri di valutazione go/no-go**:
   - ✅ **GO** se: Δ score medio ≥ +5% OPPURE hit rate migliora di ≥ 10%
   - ⚠️ **MARGINE** se: Δ score medio tra 0% e 5% → valutare caso per caso
   - ❌ **STOP** se: Δ score medio ≤ 0% o hit rate peggiora → la weighted fusion non aiuta, scartare
5. **Decisione documentata**: salvare il risultato in `.gsd/milestones/M002/slices/S01/evaluation-decision.md`
   - Se GO: pianificare Fase A (ma non iniziare)
   - Se MARGINE: valutare se i costi della Fase A giustificano il beneficio marginale
   - Se STOP: rimuovere la Fase A dal piano, S01 è completo con solo C

## Must-Haves
- [ ] Risultati fase C salvati in `phase-c-results.json`
- [ ] Delta calcolato e documentato
- [ ] Decisione go/no-go documentata con criteri oggettivi
- [ ] Se STOP: Fase A rimossa dal piano S01
  - Files: `.gsd/milestones/M002/slices/S01/phase-c-results.json`, `.gsd/milestones/M002/slices/S01/evaluation-decision.md`
  - Verify: cat evaluation-decision.md | grep -E 'GO|MARGINE|STOP'

- [ ] **T04: Fase A — Aggiungere campo sparse BM25 alla collection (solo se GO)** `est:3h`
  # Aggiungere un secondo named vector `sparse` alla collection Qdrant per il matching lessicale BM25.

## Steps
1. **Implementare generatore BM25 in JS**:
   - Funzione `generateSparseVector(text)` che restituisce `{ indices: number[], values: number[] }`
   - Algoritmo: tokenizzazione semplice (split su spazi/punteggiatura, lowercase), TF per documento, IDF calcolato dalla collection-level count (stima approssimativa)
   - Modello `Qdrant/bm25` è lo standard, ma per JS usiamo BM25 base con parametri k1=1.2, b=0.75
2. **Modificare `gsd-qdrant-template.js`**:
   - In `ensureCollection()`: creare collection con `{ dense: { size: 384 }, sparse: {} }` (sparse non ha size)
   - In `buildDocPayload()` / `buildCodePayload()`: aggiungere campo `sparseVector`
   - In `syncToGsdMemory()`: generare sparse vector per ogni documento e upsertare
3. **Rifare l'indexing** della collection (full re-sync) — i dati esistenti avranno solo il vettore dense
4. **Configurare collection** con `idf: true` (Qdrant >= 1.7 gestisce IDF nativamente per sparse vectors)

## Must-Haves
- [ ] Funzione `generateSparseVector()` testabile e indipendente
- [ ] Collection creata con due named vectors: `dense` e `sparse`
- [ ] Tutti i documenti re-indexati con entrambi i vettori
- [ ] IDF abilitato per la collection sparse
  - Files: `src/gsd-qdrant-template.js`, `src/gsd-qdrant-mcp/index.js`
  - Verify: node src/sync-knowledge.js setup && node -e "const {QdrantClient} = require('@qdrant/js-client-rest'); (async()=>{ const c=new QdrantClient({url:'http://localhost:6333'}); const col=await c.getCollection('gsd_memory'); console.log(JSON.stringify(col.config.params.vectors, null, 2)); })()" | grep -c sparse

- [ ] **T05: Fase A — Implementare RRF nativo e benchmark finale** `est:3h`
  # Sostituire la weighted fusion con RRF nativo Qdrant e validare il risultato finale.

## Steps
1. **Modificare la query in `gsd-qdrant-mcp/index.js`**:
   - Sostituire `client.search()` con `client.query()`
   - Configurare prefetch: uno per dense vector, uno per sparse vector
   - Impostare `query: { fusion: 'rrf' }`
   ```typescript
   client.query(collectionName, {
     prefetch: [
       { query: denseVector, using: 'dense', limit: 20 },
       { query: { indices, values }, using: 'sparse', limit: 20 }
     ],
     query: { fusion: 'rrf' },
     limit: resultLimit
   })
   ```
2. **Modificare `auto-retrieve-mcp.js`**:
   - Generare sparse vector per la query (stessa funzione usata per i documenti)
   - Passare prefetch dense + sparse alla chiamata MCP
3. **Disabilitare weighted fusion** (T02) se RRF funziona meglio, oppure mantenere come fallback
4. **Eseguire benchmark finale** con le stesse 10-15 query di test
5. **Salvare risultati** in `phase-a-results.json` e confrontare con baseline e fase C
6. **Documentare il risultato finale** in `evaluation-decision.md` (aggiornare la decisione)

## Must-Haves
- [ ] Query usa RRF nativo (`fusion: 'rrf'`) con prefetch dense+sparse
- [ ] Sparse vector generato sia per documenti che per query
- [ ] Benchmark finale eseguito e salvato
- [ ] Confronto baseline vs fase C vs fase A documentato
  - Files: `src/gsd-qdrant-mcp/index.js`, `src/auto-retrieve-mcp.js`, `.gsd/milestones/M002/slices/S01/phase-a-results.json`
  - Verify: node scripts/benchmark-retrieve.js && diff baseline-results.json phase-a-results.json | head -30
