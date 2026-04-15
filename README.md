# gsd-qdrant-knowledge

CLI Node.js per creare e sincronizzare una knowledge base semantica di progetto su Qdrant.

## Installazione

```bash
npm install gsd-qdrant-knowledge
```

## Obiettivo

Rendere naturale una richiesta come: "prendi il componente X dal progetto Y e applicalo qui"

**Architettura V2.0:**
- **Single collection `gsd_memory`**: tutti i progetti condividono la stessa collection Qdrant
- **Type-based classification**: punti classificati come "doc" (`.gsd`) o "code"
- **Cross-project reuse**: flag `reusable` identifica contenuti riutilizzabili tra progetti

## Setup

```bash
gsd-qdrant-knowledge
```

Crea automaticamente:
- `gsd-qdrant-knowledge/` - directory del tool
- `gsd-qdrant-knowledge/.qdrant-sync-state.json` - stato di sincronizzazione
- `gsd-qdrant-knowledge/index.js` - entry point del tool
- `.git/hooks/post-commit` - hook per auto-sync (se non esiste già)

## Auto-sync su Git Commit

L'hook `post-commit` esegue `node src/sync-knowledge.js` automaticamente dopo ogni commit locale.

**Nota:** Funziona solo per i commit locali. Per sync immediato dopo modifiche non-committate, usa `gsd-qdrant-knowledge` manualmente.

## Comandi

```bash
gsd-qdrant-knowledge                    # Bootstrap e sync completo
gsd-qdrant-knowledge context "query"    # Query contestuale con contesto ibrido
gsd-qdrant-knowledge snippet search "component" --context  # Ricerca snippet con contesto
```

## Variabili Ambiente

```bash
# Configurazione Base
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=gsd_memory
VECTOR_NAME=fast-all-minilm-l6-v2
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSIONS=384

# Qdrant Embedded (opzionale)
QDRANT_EMBEDDED=true
QDRANT_EMBEDDED_PATH=./qdrant_storage
```

## Modello Dati

**Collection `gsd_memory`** usa uno schema unificato con:

**Campi comuni:**
- `project_id`, `type` ("doc"/"code"), `source`, `content`
- `summary`, `reusable`, `tags`, `importance`, `timestamp`, `hash`

**Campi specifici "doc":**
- `subtype` (state, requirements, decision, knowledge, activity)
- `section`, `language`

**Campi specifici "code":**
- `language`, `signatures`, `comments`, `exports`, `imports`
- `relatedDocPaths`, `relatedDocIds`

## MCP Server per Auto-Retrieval

Il tool espone uno strumento MCP per retrieving automatico di contesto:

### Strumenti Disponibili

#### `retrieve_context`
Recupera contesto rilevante dalla memoria unificata Qdrant.

```javascript
{
  "query": "implementazione login",     // required
  "limit": 5,                          // optional, default: 5
  "projectId": "my-project",           // optional
  "includeContent": true               // optional, default: true
}
```

Risposta formattata con `results` array contenente oggetti con:
- `id`, `score`, `type`, `subtype`, `project_id`, `source`
- `summary`, `content`, `tags`, `language`, `reusable`, `importance`

#### `list_projects`
Restituisce la lista dei progetti unici indicizzati.

```javascript
{
  "projects": ["my-project", "another-project"],
  "totalProjects": 2
}
```

### Integrazione con GSD

```javascript
const knowledgeSharing = require('gsd-qdrant-knowledge');

// Inizializza
await knowledgeSharing.init();

// Usa come hook beforeMessage
api.on('beforeMessage', async (event, ctx) => {
  await knowledgeSharing.onBeforeMessage(event, ctx);
});

// Oppure genera prompt standalone
const prompt = await knowledgeSharing.buildPrompt(query, { limit: 10 });
```

### Filosofia

- **GSD = Source of Truth**: i file principali (`STATE.md`, `REQUIREMENTS.md`, `DECISIONS.md`, `KNOWLEDGE.md`, `PROJECT.md`) sono gestiti localmente
- **Qdrant = Enhancer**: usato esclusivamente per knowledge sharing cross-project

I file GSD del progetto corrente non vengono indicizzati in Qdrant per evitare duplicazione e consumo eccessivo di token.

## Compatibilità Windows

- Post-commit hook: `post-commit.bat` (Windows) o `post-commit.sh` (Linux/Mac)
- Path separatori uniformati con `path.sep`
- Newline handling corretto per ogni piattaforma

## Pubblicazione npm

Versione target: `2.0.1` (V2.0+ - MCP Server Integration)

```bash
npm pkg fix
npm publish --dry-run
```
