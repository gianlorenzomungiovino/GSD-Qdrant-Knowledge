# gsd-qdrant-knowledge

CLI Node.js per creare e sincronizzare una knowledge base semantica di progetto su Qdrant, con retrieving cross-project accessibile da GSD via MCP.

## Prerequisiti

- **Node.js** >= 18
- **Qdrant** in esecuzione su `localhost:6333`

### Setup Qdrant (Docker)

```bash
docker run -d \
  --name qdrant \
  -p 6333:6333 -p 6334:6334 \
  qdrant/qdrant
```

Verifica: `curl http://localhost:6333/healthz` → `"healthz check passed"`

Dashboard: `http://localhost:6333/dashboard`

## Installazione

```bash
npm install gsd-qdrant-knowledge
```

## Obiettivo

Rendere naturale una richiesta come: "prendi il componente X dal progetto Y e applicalo qui".

**Architettura V2:**

- **Single collection `gsd_memory`**: tutti i progetti condividono la stessa collection Qdrant
- **Type-based classification**: punti classificati come `doc` (`.gsd`) o `code`
- **Cross-project priority**: il retrieval favorisce contenuti cross-project e `reusable`, senza escludere il progetto corrente
- **GSD = source of truth**: i file `.gsd` locali restano il riferimento principale del progetto corrente
- **Qdrant = enhancer**: memoria condivisa tra progetti, non sostituzione del contesto locale GSD

## Setup

```bash
gsd-qdrant-knowledge
```

Il comando crea o aggiorna automaticamente:

- `gsd-qdrant-knowledge/`
- `gsd-qdrant-knowledge/.qdrant-sync-state.json`
- `gsd-qdrant-knowledge/index.js`
- `gsd-qdrant-knowledge/auto-retrieve-mcp.js`
- `gsd-qdrant-knowledge/mcp.json`
- `.mcp.json` nella root del progetto con la registrazione del server MCP `gsd-qdrant`
- `.git/hooks/post-commit*` per auto-sync

Il tool evita di scrivere dentro `.gsd/` per non confondere i flussi gestiti nativamente da GSD.

## Uninstall

```bash
gsd-qdrant-knowledge uninstall
```

Rimuove:

- `gsd-qdrant-knowledge/`
- la registrazione `gsd-qdrant` da `.mcp.json`
- l'entry `gsd-qdrant-knowledge/` da `.gitignore`

## Auto-sync su Git Commit

L'hook `post-commit` esegue il sync automatico dopo ogni commit locale.

Per un sync immediato dopo modifiche non committate, usa di nuovo:

```bash
gsd-qdrant-knowledge
```

## Comandi

```bash
gsd-qdrant-knowledge
gsd-qdrant-knowledge context "query"
gsd-qdrant-knowledge uninstall
```

## Variabili ambiente

```bash
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=gsd_memory
VECTOR_NAME=fast-all-minilm-l6-v2
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSIONS=384
```

## MCP server

Il pacchetto espone il server MCP:

```bash
gsd-qdrant-mcp
```

Durante il setup, il progetto registra in `.mcp.json` un server chiamato `gsd-qdrant`.
Questo permette a GSD di scoprirlo senza scrivere nulla dentro `.gsd/`.

## Filosofia

- **GSD** gestisce il contesto locale del progetto corrente
- **Qdrant** abilita knowledge sharing cross-project
- i file principali del progetto corrente restano gestiti da GSD
- il retrieval automatico deve integrare, non duplicare, il contesto locale

## Ricerca Ibrida

La ricerca combina similarità vettoriale e matching testuale sui payload Qdrant per risultati più precisi.

### Come funziona

1. **Ricerca vettoriale** — similarità cosine sul dense vector (384 dimensioni)
2. **Scoring lessicale** — TF-lite sui campi `summary` e `source` dei payload
3. **Fusione ponderata** — `finalScore = vectorScore * 0.65 + lexicalScore * 0.35`

I pesi sono configurabili via variabili ambiente:

```bash
VECTOR_WEIGHT=0.65   # Default: 0.65
LEXICAL_WEIGHT=0.35  # Default: 0.35
```

## Compatibilità Windows

- hook post-commit: `.bat` / `.ps1`
- path separatori uniformati
- bootstrap compatibile con install locale e da pacchetto npm
