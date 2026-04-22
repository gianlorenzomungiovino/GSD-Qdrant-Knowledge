# GSD-QDRANT-SETUP

Guida rapida al setup locale della CLI e di Qdrant.

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

### Opzione A: Docker (raccomandato per produzione)

```bash
docker run -d --name qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

### Opzione B: Modalità Embedded (senza Docker)

Se non hai Docker, la CLI avvia automaticamente un embedded QDrant:

```bash
# Avvia manualmente l'embedded QDrant
npm run start-qdrant

# Oppure il bootstrap avvia embedded automaticamente se non trova Docker
gsd-qdrant-knowledge
```

L'embedded QDrant:
- Scarica automaticamente il binary per la tua piattaforma
- Usa storage locale in `.qdrant-data/` (non committare — è in `.gitignore`)
- Ascolta sulla porta 6333 come la versione Docker
- Dashboard accessibile a `http://localhost:6333/dashboard`

Per fermare l'embedded QDrant:

```bash
npm run stop-qdrant
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

## 5. Retrieval contestuale

```bash
gsd-qdrant-knowledge context "query"
```

Il retrieval automatico via MCP:
- favorisce contenuti cross-project
- premia contenuti `reusable`
- non esclude il progetto corrente

## 6. Uninstall

```bash
gsd-qdrant-knowledge uninstall
```

Rimuove gli artifact del tool dal progetto senza toccare `.gsd/`.

## Stato del flusso (V2.0.7)

### Core features
- tool project-wide
- collection unificata `gsd_memory`
- classificazione `doc` / `code`
- GSD resta il source of truth per il progetto corrente
- Qdrant resta un enhancer per la memoria condivisa

### Integrazione MCP
- server MCP `gsd-qdrant`
- registrazione automatica in `.mcp.json`
- nessuna scrittura dentro `.gsd/`

## Versione

Versione target: `2.0.7`
