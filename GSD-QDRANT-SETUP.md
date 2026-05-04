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

## Versione

Versione target: `2.3.0` (bge-m3 + flat search + re-ranking)
