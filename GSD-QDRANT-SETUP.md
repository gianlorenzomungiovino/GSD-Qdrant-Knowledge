# GSD-QDRANT-SETUP

Guida rapida al setup locale della CLI e di Qdrant.

> **Panoramica completa del tool e delle features:** [README.md](README.md)

---

## 1. Installa la CLI

Da npm:

```bash
npm install -g gsd-qdrant-knowledge
```

Oppure nel progetto:

```bash
npm install gsd-qdrant-knowledge
```

Verifica:

```bash
gsd-qdrant-knowledge --version
```

## 2. Avvia Qdrant

Qdrant deve essere in esecuzione su `localhost:6333`.

### Docker (consigliato)

```bash
docker run -d \
  --name qdrant \
  -p 6333:6333 -p 6334:6334 \
  qdrant/qdrant
```

Verifica: `curl http://localhost:6333/healthz` → `"healthz check passed"`

Dashboard: `http://localhost:6333/dashboard`

### Installazione standalone

Scarica il binary da [GitHub releases](https://github.com/qdrant/qdrant/releases) e lancialo:

```bash
./qdrant --config config.yaml
```

## 3. Esegui il bootstrap nella root del progetto

```bash
gsd-qdrant-knowledge
```

Il comando:
- crea `gsd-qdrant-knowledge/`
- crea o aggiorna `gsd-qdrant-knowledge/mcp.json`
- registra il server MCP `gsd-qdrant` in `.mcp.json` nella root del progetto
- crea/valida la collection unificata `gsd_memory`
- sincronizza `.gsd/` e il codice del progetto
- configura l'hook `post-commit` per auto-sync
- scrive le istruzioni auto-retrieve in `.gsd/KNOWLEDGE.md`

## 4. Verifica rapida

Collection presenti:

```bash
curl -s http://localhost:6333/collections
```

Collection unificata `gsd_memory`:

```bash
curl -s "http://localhost:6333/collections/gsd_memory/points/scroll" -H "Content-Type: application/json" -d '{"limit": 2}'
```

Verifica MCP lato progetto:

```bash
cat .mcp.json
```

La root `.mcp.json` è usata solo come punto standard di discovery per GSD. Gli asset del tool restano dentro `gsd-qdrant-knowledge/`.

## 5. Query manuale

```bash
gsd-qdrant-knowledge context "query"
```

Per come funziona il retrieval automatico (auto-retrieve hook, scoring, link bidirezionali): [README.md](README.md)

## 6. Uninstall

```bash
gsd-qdrant-knowledge uninstall
```

Rimuove gli artifact del tool dal progetto senza toccare `.gsd/`.

## Variabili ambiente

| Variabile | Default | Descrizione |
|---|---|---|
| `QDRANT_URL` | `http://localhost:6333` | URL del server Qdrant |
| `COLLECTION_NAME` | `gsd_memory` | Nome della collection unificata |
| `VECTOR_NAME` | `bge-m3-1024` | Nome del vettore nella collection (Xenova/bge-m3, 1024 dim multilingue) |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Modello per le embedding (legacy — non usato in produzione) |
| `EMBEDDING_DIMENSIONS` | `1024` | Dimensione del vettore |

## Migration da v2.x a v2.3+

La versione 2.3+ introduce un cambio radicale nella strategia di indicizzazione: **un punto Qdrant per file** invece dei vecchi chunk multipli.

### Cosa è cambiato

| Aspetto | Prima (v2.x) | Dopo (v2.3+) |
|---|---|---|
| File code ≤32K | N chunk da 1500 char ciascuno (tipicamente 3-8 punti/file) | **1 punto** con contenuto intero + metadata arricchiti |
| File >32K | Chunk a 1500 char | Chunk a **8000 char** con header metadata pre-pendato |
| Metadata | Nessuno nel payload embedding | `signatures`, `exports`, `imports`, `symbolNames`, `comments` pre-pendati per positional weighting |
| Ricerca | `searchPointGroups` con deduplica client-side | Flat search + re-ranking (PREFETCH_LIMIT=50, SCORE_THRESHOLD=0.85) |

### Variabili ambiente rimosse

Le seguenti variabili non sono più usate e possono essere rimosse dal proprio `.env`:

- ~~`CHUNK_MAX`~~ — Non serve più: i file piccoli vengono indicizzati interi
- ~~`CHUNK_OVERLAP`~~ — Non serve più: nessun chunking per file ≤32K

Le variabili ancora supportate sono elencate nella tabella [Variabili ambiente](#variabili-ambiente) sopra.

### Re-index completo (obbligatorio dopo upgrade)

Poiché la struttura dei punti Qdrant è cambiata, i dati indicizzati con v2.x **non sono compatibili** con v2.3+. Per migrare:

```bash
node src/sync-knowledge.js --force-reindex
```

Questo comando:
1. Cancella tutti i punti esistenti per il progetto corrente dalla collection `gsd_memory`
2. Re-indicizza ogni file come un singolo punto (o chunk a 8000 se >32K) con la nuova struttura payload

> **Nota:** Il re-index può richiedere alcuni minuti su progetti grandi. La progressione viene stampata in console.

## Versione

Versione target: `2.3.0` (bge-m3 + flat search + re-ranking)
