# Changelog

## 2.0.7

### Changed
- Il bootstrap non crea più `gsd-qdrant-knowledge/agent/extensions/gsd/index.js`.
- Gli asset runtime del tool restano dentro `gsd-qdrant-knowledge/` con struttura più corta.
- La registrazione MCP avviene tramite `.mcp.json` nella root del progetto, senza scrivere dentro `.gsd/`.
- Il retrieval MCP favorisce risultati cross-project e contenuti `reusable`, senza escludere il progetto corrente.

### Added
- Comando `gsd-qdrant-knowledge uninstall` per rimuovere gli artifact del tool dal progetto.
- File `gsd-qdrant-knowledge/mcp.json` come stato/config locale del tool.

### Fixed
- GSD ora può scoprire il server MCP del tool tramite `.mcp.json` in root.
- Allineata la documentazione esterna (`README.md`, `GSD-QDRANT-SETUP.md`) al flusso reale.

## 2.0.6

### Fixed
- **GSD extension index.js not created**: The CLI now creates the `gsd-qdrant-knowledge/agent/extensions/gsd/index.js` file when initializing a new project. This file is required for the auto-retrieve MCP hook to be properly loaded.

## 2.0.5

### Fixed
- **MCP server not included in npm package**: Updated `package.json` files section to include the entire `src/gsd-qdrant-mcp/` directory instead of just `index.js`. Removed invalid reference to non-existent `node_modules/gsd-qdrant-knowledge/` path.

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
