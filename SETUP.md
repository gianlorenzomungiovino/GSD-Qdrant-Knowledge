# SETUP

Guida rapida al setup della CLI e di Qdrant.

> **Panoramica completa del tool e delle features:** [README.md](README.md)

---

## 1. Installa la CLI

Da npm (globale):

```bash
npm install -g gsd-qdrant-knowledge
```

Oppure locale in un progetto:

```bash
npm install gsd-qdrant-knowledge
```

Verifica:

```bash
gsd-qdrant-knowledge --version
```

> **Nota:** La CLI va installata una volta sola sul sistema. Non va copiata dentro i progetti.

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

## 3. Setup nel progetto

Esegui nella root del progetto che vuoi integrare:

```bash
gsd-qdrant-knowledge setup
```

Il comando `setup`:

- crea `.mcp.json` con configurazione del server MCP (`gsd-qdrant`)
- installa l'hook `.git/hooks/post-commit` per auto-sync
- crea `.gsd/KNOWLEDGE.md` con istruzioni per l'agent (se non esiste)
- esegue la sincronizzazione iniziale di `.gsd/` e codice sorgente

### Migrazione da v2.3.1

Se hai già installato una versione precedente (con la cartella `gsd-qdrant-knowledge/` copiata nel progetto):

```bash
gsd-qdrant-knowledge migrate
```

Questo rimuove la vecchia cartella, pulisce `.gitignore` e suggerisce di lanciare `setup`.

## 4. Verifica rapida

Verifica MCP nel progetto:

```bash
cat .mcp.json
```

Dovresti vedere il server `gsd-qdrant` con command, args e env configurati.

## 5. Variabili ambiente

| Variabile              | Default                 | Descrizione                                                             |
| ---------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `QDRANT_URL`           | `http://localhost:6333` | URL del server Qdrant                                                   |
| `COLLECTION_NAME`      | `gsd_memory`            | Nome della collection unificata                                         |
| `VECTOR_NAME`          | `bge-m3-1024`           | Nome del vettore nella collection (Xenova/bge-m3, 1024 dim multilingue) |
| `EMBEDDING_MODEL`      | `Xenova/bge-m3`         | Modello embedding                                                       |
| `EMBEDDING_DIMENSIONS` | `1024`                  | Dimensione del vettore                                                  |

## Architettura v2.3.2

```
Sistema (installato una volta via npm):
├── gsd-qdrant-knowledge  (CLI — bin entry)
└── gsd-qdrant-mcp        (MCP server — bin entry)

Progetto (config minimi, zero JS):
├── .mcp.json             (configurazione MCP — punta al server)
├── .git/hooks/post-commit (hook auto-sync)
└── .gsd/
    ├── KNOWLEDGE.md       (istruzioni agent)
    └── .qdrant-sync-state.json (stato sync locale)
```

---

**Link utili:** [README](README.md) · [Changelog](CHANGELOG.md)
