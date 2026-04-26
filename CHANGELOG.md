# Changelog

## 2.2.2

### Fixed

- **Setup hanging dopo completamento (rimanente)**: Il fix di 2.2.1 applicava `process.exit(0)` solo a `setup-from-templates.js`, ma il CLI principale (`src/cli.js`) in `bootstrapProject()` non chiamava più `process.exit()` dopo `console.log('\n✅ Ready')`. Node.js manteneva il processo vivo perché il client Qdrant tiene connessioni TCP keep-alive aperte. Aggiunto `process.exit(0)` in `cli.js` e `.then(() => process.exit(0))` in `sync-knowledge.js`.

## 2.2.1

### Fixed

- **Uninstall cancellava tutti i punti della collection, non solo quelli del progetto corrente**: Il parametro `scroll_filter` passato a `/points/scroll` era ignorato da Qdrant (il parametro corretto è `filter`). Senza filtro server-side, lo scroll restituiva **tutti** i punti della collection e l'uninstall cancellava anche i dati di altri progetti. Sostituito `scroll_filter` con `filter` in tutti e tre i metodi: `deleteAllProjectPoints()`, `deleteMissingPoints()`, `deleteStaleProjectPoints()`.
- **Aggiunto cleanup Qdrant durante uninstall**: Il comando `gsd-qdrant-knowledge uninstall` ora cancella esplicitamente tutti i punti Qdrant del progetto prima di rimuovere gli artifact locali. In precedenza l'uninstall non toccava affatto la collection, lasciando dati orfani che potevano essere cancellati in modo errato dai successivi sync.
- **Setup hanging dopo completamento**: `setup-from-templates.js` non chiamava più `process.exit()` dopo il completamento asincrono, causando un terminale apparentemente bloccato. Aggiunto `.then(() => process.exit(0))` per uscita pulita.

## 2.2.0

### Added

- **QDrant health check before sync**: Bootstrap now runs `ensureQdrantRunning()` which hits `/healthz` before attempting sync. Provides clear error message with Docker command if QDrant is not available, and accepts `QDRANT_URL` environment variable override.
- **Environment propagation during sync**: `spawnSync` for the sync script now passes `env: { ...process.env }` instead of inheriting implicitly, ensuring `QDRANT_URL` and `COLLECTION_NAME` are available to the sync process.
- **Hybrid search documentation**: README.md and GSD-QDRANT-SETUP.md updated with Docker setup instructions, standalone QDrant installation, and hybrid search explanation (vector cosine + lexical TF-lite, weighted fusion).
- **QDrant v1.17.1 compatibility**: M002 roadmap updated for Qdrant client v1.17.1, with new S03 documentation slice.
- **Pre-publish checklist cleanup**: Removed step 11 (publish command) from checklist — publish is now a manual action the user runs separately.

### Changed

- **M002 roadmap restructured**: Hybrid search approach changed from C→A, with updated slice plans and new S03 documentation slice.

### Removed

- **Embedded QDrant experiment**: `src/embedded-qdrant.js` and `scripts/qdrant-cli.js` were created and then removed during the branch exploration. The final approach keeps Docker-based QDrant as the only deployment option.

## 2.1.9

### Fixed

- **Document embedding title missing**: `buildDocPayload` now includes a `title` field so that `buildDocText` can inject the document title into the embedding text. Previously only `.summary` existed but `.title` was expected, causing document titles to be omitted from vectors — weakening semantic search quality for docs.

### Removed

- **Dead code cleanup**: Removed orphaned and unused methods from `GSDKnowledgeSync`:non hffff
  - `findRelevantDocsForSnippet` (buggy: iterated `docIndex.allDocs` on an array, never called)
  - `buildSnippetText` (never called)
  - `indexFile` (never called, also referenced undefined `metadata`)
  - Duplicate `buildDocText` definition (was silently overwritten by the later one)
- **Orphaned file**: Removed `src/knowledge-sharing.js` — zero importers across the entire codebase.

## 2.1.8

### Fixed

- **KNOWLEDGE.md created during setup**: `setup-from-templates.js` now calls `ensureKnowledgeInstructions()` to create `.gsd/KNOWLEDGE.md` during setup. Previously this was only done in the CLI `bootstrapProject()`, so direct usage of `setup-from-templates.js` left KNOWLEDGE.md missing — breaking auto-retrieve.

## 2.1.7

### Fixed

- **Empty collection re-index**: When the Qdrant collection was deleted and recreated, the sync state file still had hashes from the previous indexing, causing "Updated 0" even though the collection was empty. Now checks if the collection has 0 points before syncing and resets the sync state to force a full re-index of all files.

## 2.1.5

### Changed

- **Writes to KNOWLEDGE.md instead of AGENTS.md**: The GSD (pi) CLI does not inject AGENTS.md into the system prompt — it only discovers it for `discover_configs`. KNOWLEDGE.md is actually injected. Bootstrap now writes the Qdrant auto-retrieve instructions to `.gsd/KNOWLEDGE.md` (project-level) with marker-based dedup, same as the previous AGENTS.md approach. Uninstall removes only the Qdrant section from KNOWLEDGE.md. AGENTS.md is no longer used.

## 2.1.4

### Changed

- **AGENTS.md path corrected**: Moved from `.gsd/agent/AGENTS.md` to project root `AGENTS.md`. The GSD (pi) CLI loads `AGENTS.md` from the project root (Codex convention at `<projectRoot>/AGENTS.md`), not from `.gsd/agent/`. Bootstrap now auto-migrates existing files from the old path to the new one. Uninstall cleans up both paths.

### Changed

- **Project-local instructions**: AGENTS.md moved from global `~/.gsd/agent/AGENTS.md` to project-local `<cwd>/.gsd/agent/AGENTS.md`, so instructions only load when GSD/pi runs inside the specific project that has Qdrant installed.
- **Uninstall cleanup**: CLI `uninstall` now removes Qdrant section from AGENTS.md (marker-based partial removal, preserving other content).
- **CLAUDE.md support disabled**: CLAUDE.md writing is commented and gated behind `// FUTURE` markers — will be activated when proper Claude Code detection is implemented.

## 2.1.2

### Fixed

- **Windows HOME env var missing**: Added `process.env.USERPROFILE` fallback when `HOME` is not set on Windows (which happens in some configurations). Without this, the GSD home directory path resolved as `.gsd` (relative) instead of `C:\Users\<user>\.gsd`, breaking AGENTS.md creation during bootstrap.

## 2.1.1

### Changed

- **Explicit auto_retrieve call rules**: Replaced passive "when to use" instructions in AGENTS.md with explicit "always call" rules for library/framework/component/technology questions, and a fallback rule when local search returns no relevant results.

## 2.1.0

### Added

- **Tarball integration test**: Pre-publish checklist includes sandbox installation, CLI version check, bootstrap verification, MCP server startup, `auto_retrieve` tool execution with cross-project results, and uninstall cleanup — all verified passing.

## 2.0.9

### Fixed

- **MCP path resolution for global installs**: Added `getMcpServerPath()` that resolves the MCP server path via three fallbacks: local `node_modules` → global npm root (`npm root -g`) → relative dev paths. Previously `ensureToolMcpConfig()` and `ensureRootMcpRegistration()` hardcoded `./node_modules/gsd-qdrant-knowledge/...` which failed when the package was installed globally. Also fixed `getGlobalNodeModulesPath()` to use `{ shell: true }` in `spawnSync` for Windows `npm.cmd` compatibility.

## 2.0.8

### Fixed

- **MCP server loading in npm-installed scenario**: The MCP server now uses `require.resolve('gsd-qdrant-knowledge')` for proper npm module resolution, with a relative path fallback for local development. Previously it only tried hardcoded `../..` / `../` paths which failed when both packages were installed globally as separate npm packages.
- **Dependency version alignment**: Aligned `zod` (^4.3.6) and `@modelcontextprotocol/sdk` (^1.29.0) versions between the main package and the MCP server sub-package.
- **MCP server standalone publishability**: Added `bin` field and `peerDependencies` to `src/gsd-qdrant-mcp/package.json` so it can be published and consumed as a standalone npm package.

### Updated

- `src/gsd-qdrant-mcp/README.md` — corrected tool name (`auto_retrieve` instead of `retrieve_context`), updated dependency versions, added peer dependency documentation.

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
