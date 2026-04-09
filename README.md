# gsd-qdrant-cli

CLI Node.js per creare e sincronizzare una knowledge base semantica di progetto su Qdrant.

## Obiettivo del prodotto

L'obiettivo non è solo indicizzare file, ma rendere naturale una richiesta come:

> "prendi il componente X dal progetto Y e applicalo qui"

Per questo il tool separa:
- contesto GSD (`.gsd`) → collection `docs`
- codice riutilizzabile → collection `snippets`

E arricchisce gli snippet con metadata strutturali e link verso il contesto `.gsd`.

## Come funziona

Lanciando `gsd-qdrant` nella root di un progetto Node.js:

1. crea `gsd-qdrant/`
2. crea `gsd-qdrant/.qdrant-sync-state.json`
3. crea `gsd-qdrant/index.js`
4. crea o valida due collection Qdrant per progetto:
   - `<project>-docs`
   - `<project>-snippets`
5. indicizza `.gsd` nella collection `docs`
6. indicizza il codice progetto nella collection `snippets`
7. collega ogni snippet ai documenti `.gsd` rilevanti

## Modello dati

### Collection `docs`
Payload principali:
- `kind: docs`
- `project`
- `path`
- `title`
- `date`
- `content`
- `ids`
- `linksTo`

### Collection `snippets`
Payload principali:
- `kind: snippet`
- `project`
- `path`
- `language`
- `scope`
- `workspace`
- `kindDetail`
- `name`
- `symbolNames`
- `exports`
- `imports`
- `ids`
- `relatedDocs`
- `relatedDocPaths`
- `relatedDocIds`
- `content`

Questa struttura è pensata per retrieval più precisi su query generiche di riuso.

## Uso

```bash
gsd-qdrant
```

Comandi principali:

```bash
gsd-qdrant
gsd-qdrant snippet search "component button" --context
gsd-qdrant snippet apply "script per docker"
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
EMBEDDING_DIMENSIONS=384
```

## Stato attuale

- `gsd-qdrant` è l'entry point unico per bootstrap + sync
- bootstrap e sync sono project-wide, senza ramo frontend/backend
- reinstallazioni inutili evitate quando i pacchetti minimi sono già presenti
- output CLI ripulito sul happy path
- snippet arricchiti con metadata strutturali e contesto `.gsd`

## Prossimo focus

Il lavoro principale rimasto è il retrieving quality:
- ranking migliore per componenti/hooks/utils/routes/scripts
- controllo compatibilità target prima dell'apply
- `snippet apply` Qdrant-first invece che database statico-first

## Pubblicazione npm

Versione target corrente del repository: `1.0.7`

Prima di pubblicare:

```bash
npm pkg fix
npm publish --dry-run
```

`npm publish --dry-run` resta la validazione autorevole dello stato del package.
