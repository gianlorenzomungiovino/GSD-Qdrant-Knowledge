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

| Variabile                 | Default                 | Descrizione                                                                               |
| ------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `QDRANT_URL`              | `http://localhost:6333` | URL del server Qdrant                                                                     |
| `COLLECTION_NAME`         | `gsd_memory`            | Nome della collection unificata                                                           |
| `VECTOR_NAME`             | `bge-m3-1024`           | Nome del vettore nella collection (Xenova/bge-m3, 1024 dim multilingue)                   |
| `EMBEDDING_MODEL`         | `Xenova/bge-m3`         | Modello embedding                                                                         |
| `EMBEDDING_DIMENSIONS`    | `1024`                  | Dimensione del vettore                                                                    |
| `QDRANT_QUANTIZATION`     | `turbo`                 | Tipo di quantizzazione: `turbo` (default), `none` (disabilita)                            |
| `QDRANT_TURBO_BITS`       | `bits4`                 | Profondità encoding: `bits4` (8x, default), `bits2` (16x), `bits1_5` (24x), `bits1` (32x) |
| `QDRANT_TURBO_ALWAYS_RAM` | `true`                  | Mantieni vettori quantizzati in RAM (default: true)                                       |

### TurboQuant (Qdrant 1.18+)

La quantizzazione TurboQuant è **abilitata di default**. Offre:

- **~8x compression** vs F32 (doppia della scalar quantization)
- **Recall ~0.92** (quasi invariata rispetto a F32)
- **Velocità simile** alla scalar quantization
- **Funziona con qualsiasi embedding model** (non serve distribuzione centrata)

Per disabilitare: `QDRANT_QUANTIZATION=none`

> **Nota:** Abilitare TurboQuant su una collection esistente richiede un **full re-index**. Il tool lo fa automaticamente al prossimo sync.

## Cache del modello embedding

Il modello `bge-m3` (~1.4 GB) viene scaricato automaticamente durante `npm install` (postinstall hook) nella cache HuggingFace:

```
# Windows
C:\Users\<Utente>\.cache\huggingface\hub\Xenova\bge-m3

# macOS / Linux
~/.cache/huggingface/hub/Xenova/bge-m3
```

Questo modello è **condiviso** con altri tool che usano `@xenova/transformers`. Non viene rimosso durante `gsd-qdrant-knowledge uninstall` — se vuoi liberare spazio, cancella manualmente la directory.

## Architettura

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
