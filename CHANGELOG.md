# Changelog

## 2.0.2

### Fixed
- **Dependency installation in wrong directory**: The CLI was using the string `'project root'` instead of the actual `PROJECT_ROOT` path for `npm install`, causing installation failures.
- **Windows shell compatibility**: Added `shell: true` to `spawnSync` calls - required for CMD executables (like `npm.cmd`) on Windows. Exit codes were always `null` without this.
- **Obsolete log messages**: Fixed `install-gsd-extension.js` to only print "Created" messages when files are actually being created for the first time, not on every run.

## 2.0.0

### Added
- **Auto-retrieve MCP Hook**: Estensione GSD che abilita il retrieving automatico del contesto cross-project prima di ogni risposta.
- **MCP SDK integration**: Il server MCP `gsd-qdrant` ora utilizza `@modelcontextprotocol/sdk` per una comunicazione più robusta con GSD.
- **Installazione automatica dell'estensione GSD**: Quando il CLI viene eseguito per la prima volta, installa automaticamente l'estensione GSD che abilita il retrieving automatico.

### Changed
- Aggiunte dipendenze al package.json: `@modelcontextprotocol/sdk` e `zod`.
- Aggiunti file alla distribuzione npm: `auto-retrieve-mcp.js` e `install-gsd-extension.js`. (già presenti nella sezione `files`)

## 1.0.7

### Changed
- `gsd-qdrant` è ora l'entry point unico per bootstrap, creazione collection e sync.
- Rimossa la distinzione operativa frontend/backend come flusso principale.
- `scripts/setup-from-templates.js` è stato semplificato: prepara il progetto dalla root, crea le collection e installa il post-commit hook.
- L'output CLI del comando base è stato ripulito sul happy path.
- Le reinstallazioni inutili sono evitate: i pacchetti richiesti vengono installati solo se mancanti.

### Added
- Indicizzazione reale dei file di codice nella collection `<project>-snippets`.
- Metadata strutturali negli snippet:
  - `name`
  - `symbolNames`
  - `exports`
  - `imports`
  - `workspace`
  - `kindDetail`
- Collegamenti contestuali tra snippet e documenti `.gsd` tramite:
  - `relatedDocs`
  - `relatedDocPaths`
  - `relatedDocIds`

### Fixed
- Corretto il bootstrap quando `gsd-qdrant/` viene eliminata e ricreata da zero.
- Corretto l'uso dei placeholder embeddings per evitare vettori invalidi e collection vuote.
- Il comando ora fallisce esplicitamente se il sync fallisce.
- Rimosso il doppio log `Sync complete!`.
- Allineata la versione del package da stato incoerente a `1.0.7`.

### Cleanup
- Consolidata la documentazione esterna in soli tre file:
  - `README.md`
  - `GSD-QDRANT-SETUP.md`
  - `CHANGELOG.md`
- Rimossi markdown obsoleti e note duplicate fuori da `.gsd`.
- Rimossi helper, test e file storici non più coerenti con il flusso attuale.

## 1.0.6

Versione pubblicata attualmente su npm.
