# gsd-qdrant-cli

CLI Node.js per creare e sincronizzare una knowledge base semantica di progetto su Qdrant.

## Obiettivo del tool

L'obiettivo non è solo indicizzare file, ma rendere naturale una richiesta come:

> "prendi il componente X dal progetto Y e applicalo qui"

Per questo il tool usa un'architettura unificata V2.0:

- **Single collection `gsd_memory`**: tutti i progetti condividono la stessa collection Qdrant
- **Type-based classification**: ogni punto ha un tipo ("doc" per documenti `.gsd`, "code" per codice)
- **Project filtering**: `project_id` permette query specifiche per progetto o cross-project
- **Cross-project reuse**: flag `reusable` identifica contenuti riutilizzabili tra progetti

## Come funziona

Lanciando `gsd-qdrant` nella root di un progetto Node.js:

1. crea `gsd-qdrant/`
2. crea `gsd-qdrant/.qdrant-sync-state.json`
3. crea `gsd-qdrant/index.js`
4. crea o valida la collection unificata `gsd_memory` (single collection per tutti i progetti)
5. indicizza `.gsd/*.md` nella collection `gsd_memory` (tipo "doc")
   - **Nota:** I file principali del progetto (`STATE.md`, `REQUIREMENTS.md`, `DECISIONS.md`, `KNOWLEDGE.md`, `PROJECT.md`) sono esclusi dall'indicizzazione in Qdrant perché GSD li gestisce già localmente. Qdrant è usato solo per il knowledge sharing cross-project.
6. indicizza il codice progetto nella collection `gsd_memory` (tipo "code")
7. collega ogni punto codice ai documenti `.gsd` rilevanti tramite `relatedDocPaths` e `relatedDocIds`

### Auto-sync su Git Commit

Il setup crea automaticamente un hook Git `post-commit` che esegue l'indicizzazione in background dopo ogni commit locale:

```bash
# L'hook viene creato automaticamente durante il setup
# Esegue: node src/sync-knowledge.js dopo ogni commit
```

Questo garantisce che il database Qdrant rimanga sincronizzato con le modifiche al codice e alla documentazione `.gsd` senza intervento manuale.

## Modello dati

### Collection Unificata `gsd_memory` (V2.0)

La collezione unificata usa un unico schema con campi comuni e campi specifici per tipo:

**Campi comuni:**

- `project_id`: identifica il progetto per filtering cross-project
- `type`: classificazione ("doc" per documenti `.gsd`, "code" per codice)
- `source`: percorso relativo del file
- `content`: contenuto completo del file
- `summary`: sintesi estratta automaticamente
- `reusable`: flag per identificare contenuti riutilizzabili tra progetti
- `tags`: array di tag estratti dal contenuto
- `importance`: punteggio di importanza (1-5)
- `timestamp`: data di indicizzazione
- `hash`: hash del contenuto per change detection

**Campi specifici per tipo "doc":**

- `subtype`: sottotipo (state, requirements, decision, knowledge, activity)
- `section`: sezione semantica del file (current_state, decisions, knowledge, ecc.)
- `language`: "markdown"

**Campi specifici per tipo "code":**

- `language`: linguaggio di programmazione
- `signatures`: firme di funzioni/classi (solo signature, non corpo completo)
- `comments`: commenti JSDoc e single-line per contesto semantico
- `exports`, `imports`, `symbolNames`: metadata strutturali
- `kindDetail`, `scope`, `workspace`: contesto strutturale
- `relatedDocPaths`, `relatedDocIds`: link al contesto `.gsd` rilevante

## Uso

```bash
gsd-qdrant
```

### Auto-sync su Git Commit

Il setup crea automaticamente un hook Git `post-commit` che esegue l'indicizzazione in background dopo ogni commit locale. L'hook viene creato nella cartella `.git/hooks/post-commit` e esegue `node src/sync-knowledge.js` automaticamente.

**Nota:** L'auto-sync funziona solo per i commit locali, non per i push remoti. Per sync immediato dopo modifiche non-committate, usa `gsd-qdrant` manualmente.

Comandi principali:

```bash
gsd-qdrant                    # Bootstrap e sync completo
gsd-qdrant context "query"    # Query contestuale con contesto ibrido
gsd-qdrant snippet search "component" --context  # Ricerca snippet con contesto
```

## Requisiti

- Node.js >= 18
- Qdrant raggiungibile, default: `http://localhost:6333`

Avvio locale rapido:

```bash
docker run -d --name qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

## Variabili ambiente

### Configurazione Base

```bash
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=gsd_memory
VECTOR_NAME=fast-all-minilm-l6-v2
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSIONS=384
```

### Configurazione Qdrant Embedded (Opzionale)

Per utilizzare Qdrant embedded (senza container Docker esterno), impostare:

```bash
QDRANT_EMBEDDED=true
QDRANT_EMBEDDED_PATH=./qdrant_storage
```

Quando `QDRANT_EMBEDDED` è impostato su `true`, il tool utilizza una istanza embedded di Qdrant che salva i dati nel percorso specificato invece di connettersi a un server esterno.

**Note:**
- `QDRANT_EMBEDDED=false` (default): utilizza Qdrant esterno (Docker)
- `QDRANT_EMBEDDED=true`: utilizza Qdrant embedded
- `QDRANT_EMBEDDED_PATH`: percorso locale dove salvare i dati (default: `./qdrant_storage`)

## Stato attuale (V2.0+)

- `gsd-qdrant` è l'entry point unico per bootstrap + sync
- **Collection unificata `gsd_memory`**: singolo punto di indicizzazione per tutti i progetti
- **Type-based classification**: punti classificati come "doc" o "code"
- bootstrap e sync sono project-wide, senza ramo frontend/backend
- reinstallazioni inutili evitate quando i pacchetti minimi sono già presenti
- output CLI ripulito sul happy path
- snippet arricchiti con metadata strutturali, commenti e contesto `.gsd`

## Funzionalità Aggiornate (V2.0+)

### MCP Server per Auto-Retrieval

Il retrieving automatico è ora integrato come MCP server:

- **Server MCP `gsd-qdrant`**: server che espone gli strumenti `retrieve_context` e `list_projects`
- **Integrazione GSD**: può essere chiamato prima di ogni risposta GSD per recuperare contesto rilevante dalla memoria unificata Qdrant
- **Nessuna modifica a GSD**: il server opera esternamente, senza toccare il codice di GSD - è un enhancer che funziona indipendentemente

## Auto-Retrieve

Il sistema di auto-retrieve permette il recupero automatico di contesto rilevante dalla memoria unificata Qdrant prima di ogni risposta GSD. Questo garantisce che l'LLM abbia accesso a informazioni cross-project senza duplicazione manuale.

### Come Funziona

1. **Inizializzazione**: Il server MCP `gsd-qdrant` viene avviato e connesso al client MCP
2. **Pre-message hook**: Prima di ogni risposta GSD, il sistema esegue una query semantica alla collection `gsd_memory`
3. **Ranking e filtraggio**: I risultati sono ordinati per rilevanza e filtrati per progetto se necessario
4. **Contesto arricchito**: Il contesto recuperato viene inserito nel prompt dell'LLM prima della generazione della risposta

### Strumenti Disponibili

#### `retrieve_context`
Recupera contesto rilevante dalla memoria unificata GSD-Qdrant.

**Parametri:**
- `query` (required): La query dell'utente da cercare
- `limit` (optional, default: 5): Numero massimo di risultati da recuperare
- `projectId` (optional): Project ID per filtrare risultati specifici a un progetto
- `includeContent` (optional, default: true): Includere il contenuto completo nel risultato

**Risposta formattata:**
```json
{
  "query": "implementazione login",
  "results": [
    {
      "id": "abc123",
      "score": 0.85,
      "type": "doc",
      "subtype": "decision",
      "project_id": "my-project",
      "source": ".gsd/DECISIONS.md",
      "summary": "Decisione sul sistema di autenticazione",
      "content": "...",
      "tags": ["decision", "auth"],
      "language": "markdown",
      "reusable": true,
      "importance": 4
    }
  ],
  "totalFound": 1,
  "filteredByProject": false
}
```

#### `list_projects`
Restituisce la lista dei progetti unici indicizzati nella memoria.

**Risposta formattata:**
```json
{
  "projects": ["my-project", "another-project"],
  "totalProjects": 2
}
```

### Integrazione con GSD

Il server MCP può essere integrato nel flusso GSD come hook `beforeMessage` per retrieving automatico:

```javascript
const knowledgeSharing = require('./src/knowledge-sharing');

// Inizializza il sistema di knowledge sharing
await knowledgeSharing.init();

// Usa come hook beforeMessage per retrieving automatico
api.on('beforeMessage', async (event, ctx) => {
  await knowledgeSharing.onBeforeMessage(event, ctx);
});

// Oppure genera prompt standalone con query personalizzate
const prompt = await knowledgeSharing.buildPrompt(query, { limit: 10 });
```

### Configurazione

Le seguenti variabili ambiente controllano il comportamento dell'auto-retrieve:

```bash
# Configurazione Base
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=gsd_memory
VECTOR_NAME=fast-all-minilm-l6-v2
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSIONS=384

# Configurazione Qdrant Embedded (Opzionale)
QDRANT_EMBEDDED=true
QDRANT_EMBEDDED_PATH=./qdrant_storage
```

### Filosofia: GSD = Source of Truth, Qdrant = Enhancer

Per evitare duplicazione di contesto e consumo eccessivo di token, il sistema esclude automaticamente i file principali del progetto corrente dall'indicizzazione in Qdrant:

- `STATE.md`, `REQUIREMENTS.md`, `DECISIONS.md`, `KNOWLEDGE.md`, `PROJECT.md`, `FUTURE-REQUIREMENTS.md`

Questi file sono gestiti localmente da GSD e non vengono indicizzati in Qdrant. Qdrant è usato esclusivamente per il knowledge sharing cross-project, mentre GSD rimane la source of truth per il progetto corrente.

### Esempi d'Uso

#### Query Contestuale
```bash
# Query con contesto ibrido da documenti e codice
gsd-qdrant context "come viene gestita l'autenticazione?"

# Ricerca snippet con contesto
gsd-qdrant snippet search "component" --context
```

#### Integrazione Programmatica
```javascript
// Recupera contesto per una query specifica
const results = await knowledgeSharing.retrieveContext({
  query: "implementazione API REST",
  limit: 5,
  projectId: "my-project"
});

// Ottieni lista dei progetti indicizzati
const projects = await knowledgeSharing.listProjects();
```

### Knowledge Sharing Nativo

Il modulo nativo per integrazione event-based con GSD:

- **Modulo `src/knowledge-sharing.js`**: fornisce integrazione nativa per il knowledge sharing con Qdrant
- **Hook event-based**: può essere chiamato prima di ogni risposta GSD per arricchire il prompt con contesto
- **Comandi CLI standalone**: `gsd-qdrant context` e `gsd-qdrant snippet search` usano il nuovo modulo

**Uso come hook beforeMessage:**
```javascript
const knowledgeSharing = require('./src/knowledge-sharing');

// Inizializza
await knowledgeSharing.init();

// Usa come hook beforeMessage per retrieving automatico
api.on('beforeMessage', async (event, ctx) => {
  await knowledgeSharing.onBeforeMessage(event, ctx);
});

// Oppure genera prompt standalone
const prompt = await knowledgeSharing.buildPrompt(query, { limit: 10 });
```

### Filosofia: GSD = Source of Truth, Qdrant = Enhancer

Per evitare duplicazione di contesto e consumo eccessivo di token, il sistema esclude automaticamente i file principali del progetto corrente dall'indicizzazione in Qdrant:

- `STATE.md`, `REQUIREMENTS.md`, `DECISIONS.md`, `KNOWLEDGE.md`, `PROJECT.md`, `FUTURE-REQUIREMENTS.md`

Questi file sono gestiti localmente da GSD e non vengono indicizzati in Qdrant. Qdrant è usato esclusivamente per il knowledge sharing cross-project, mentre GSD rimane la source of truth per il progetto corrente.

### Compatibilità Windows

Tutti i file sono stati aggiornati per supportare sia Windows che Linux:

- **Post-commit hook**: creato in base al sistema operativo (`post-commit.bat` per Windows, `post-commit.sh` per Linux/Mac)
- **Separatori di path**: uniformati all'uso di `path.sep`
- **Newline handling**: corretto per ogni piattaforma

## Pubblicazione npm

Versione target corrente del repository: `2.0.1` (V2.0+ - MCP Server Integration)

Prima di pubblicare:

```bash
npm pkg fix
npm publish --dry-run
```

`npm publish --dry-run` resta la validazione autorevole dello stato del package.
