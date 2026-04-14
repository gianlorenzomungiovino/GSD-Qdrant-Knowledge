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
# Esegue: node scripts/sync-knowledge.js dopo ogni commit
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
- `language": "markdown"

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

Il setup crea automaticamente un hook Git `post-commit` che esegue l'indicizzazione in background dopo ogni commit locale. L'hook viene creato nella cartella `.git/hooks/post-commit` e esegue `node scripts/sync-knowledge.js` automaticamente.

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

```bash
QDRANT_URL=http://localhost:6333
VECTOR_NAME=fast-all-minilm-l6-v2
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSIONS=1024  # V2.0: unified collection uses 1024 dims
```

## Stato attuale (V2.0)

- `gsd-qdrant` è l'entry point unico per bootstrap + sync
- **Collection unificata `gsd_memory`**: singolo punto di indicizzazione per tutti i progetti
- **Type-based classification**: punti classificati come "doc" o "code"
- bootstrap e sync sono project-wide, senza ramo frontend/backend
- reinstallazioni inutili evitate quando i pacchetti minimi sono già presenti
- output CLI ripulito sul happy path
- snippet arricchiti con metadata strutturali, commenti e contesto `.gsd`

## Prossimo focus (V2.0)

### Knowledge Sharing Nativo

Il retrieving automatico è ora integrato come modulo nativo:

- **Modulo `scripts/knowledge-sharing.js`**: fornisce integrazione nativa per il knowledge sharing con Qdrant
- **Hook event-based**: può essere chiamato prima di ogni risposta GSD per arricchire il prompt con contesto
- **Comandi CLI standalone**: `gsd-qdrant context` e `gsd-qdrant snippet search` usano il nuovo modulo

### Filosofia: GSD = Source of Truth, Qdrant = Enhancer

Per evitare duplicazione di contesto e consumo eccessivo di token, il sistema esclude automaticamente i file principali del progetto corrente dall'indicizzazione in Qdrant:

- `STATE.md`, `REQUIREMENTS.md`, `DECISIONS.md`, `KNOWLEDGE.md`, `PROJECT.md`, `FUTURE-REQUIREMENTS.md`

Questi file sono gestiti localmente da GSD e non vengono indicizzati in Qdrant. Qdrant è usato esclusivamente per il knowledge sharing cross-project, mentre GSD rimane la source of truth per il progetto corrente.

### Compatibilità Windows

Tutti i file sono stati aggiornati per supportare sia Windows che Linux:

- **Post-commit hook**: creato in base al sistema operativo (`post-commit.bat` per Windows, `post-commit.sh` per Linux/Mac)
- **Separatori di path**: uniformati all'uso di `path.sep`
- **Newline handling**: corretto per ogni piattaforma

### Altre miglioramenti

- ranking migliore per componenti/hooks/utils/routes/scripts basato su intent detection
- controllo compatibilità target prima dell'apply
- `snippet apply` Qdrant-first invece che database statico-first
- **Cross-project insights**: sfruttare la collection unificata per conoscenze condivise tra progetti

## Pubblicazione npm

Versione target corrente del repository: `2.0.0` (V2.0 - Unified Collection)

Prima di pubblicare:

```bash
npm pkg fix
npm publish --dry-run
```

`npm publish --dry-run` resta la validazione autorevole dello stato del package.
