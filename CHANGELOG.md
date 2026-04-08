# Changelog

## [1.0.7] - 2026-04-08

### 🐛 Bug Fixes

- **Fixed `pathToId()` ID generation**
  - Fixed: Method was generating invalid ID formats for Qdrant (strings, large numbers)
  - Now generates valid UUID v4 format for all points
  - Ensures compatibility with Qdrant's ID requirements (unsigned integer or UUID)

- **Fixed sync execution in CLI**
  - Changed from `run()` to `spawnSync()` with `stdio: 'inherit'`
  - Now properly shows sync output and handles errors
  - Fixes "fetch failed" errors during batch upsert

### 📦 Architecture Changes

- **Two separate collections per project**
  - `{project-name}-docs` → `.md` files in `.gsd/`
  - `{project-name}-snippets` → all other source files
  - Replaces single `{project-name}-gsd` collection

- **Reduced batch size**
  - Changed from 100 to 10 points per batch
  - Avoids payload size issues with large embeddings

### 📝 Documentation

- Updated README.md with collection structure details
- Updated CHANGELOG.md with version 1.0.7 changes
- Updated GSQ-QDRANT-SETUP.md with concise instructions

---

## [1.0.6] - 2026-04-08

### 🐛 Bug Fixes

- **Collection naming now uses directory name**
  - Fixed: Collection name was incorrectly derived from `package.json` `name` field
  - Now always uses project directory name (e.g., `my-project` → `my-project-gsd`)
  - Ensures consistent naming regardless of `package.json` configuration

### 📝 Documentation

- Updated CHANGELOG.md with version 1.0.6 changes

---

## [1.0.5] - 2026-04-08

### 🌟 New Features

- **Universal Project Support**
  - Works in frontend-only projects (Vite, React, etc.)
  - Works in backend-only projects (Express, Nest, etc.)
  - Works in full-stack/monorepo projects
  - No manual configuration required for any project type

- **Graceful Degradation**
  - Setup continues even if templates are unavailable
  - Collection creation always succeeds regardless of template fetch
  - Clear messages for missing components (e.g., `src/lib`, `src/server.js`)

### 🔧 Improvements

- **Conditional Setup Logic**
  - npm scripts only added when API directory exists
  - Post-commit hook only installed when `.git/hooks` exists
  - Server patching only performed when `src/server.js` exists
  - Better error messages for each conditional operation

- **Enhanced Error Handling**
  - Handles null/undefined API directory gracefully
  - Catches and logs template fetch errors without failing setup
  - Collection creation uses try-catch with clear status messages

### 📝 Documentation

- Updated README.md with universal project support details
- Added CLI-IMPROVEMENTS.md with architecture and implementation details
- Updated troubleshooting section with frontend-only scenarios

---

## [1.0.4] - 2026-04-08

### 🔧 Improvements

- **Added `--version` flag support**
  - `gsd-qdrant --version` now shows the CLI version
  - Also supports `-v` as a shorthand

---

## [1.0.3] - 2026-04-08

### 🚀 New Features

- **Full Source Indexing**
  - Index all project source files for comprehensive knowledge base
  - Enhanced search capabilities across entire codebase
  - Automatic detection of project structure

### 🔧 Improvements

- Refined project-scoped collections logic
- Better error handling in sync operations
- Improved performance for large projects

---

## [1.0.2] - 2026-04-08

### 🚀 New Features

- **Project-Scoped Collections**
  - Each project gets isolated collections: `{project-name}-docs` and `{project-name}-snippets`
  - Automatic collection creation on first sync
  - Universal usability - works in any project without manual configuration

- **Extended File Type Support**
  - Added support for 12 file extensions: `.md`, `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.go`, `.rs`, `.sql`, `.json`, `.yml`, `.yaml`
  - Code snippets indexed alongside documentation

### 🔧 Improvements

- Removed hardcoded component lists
- Enhanced search with context from `.md` files
- Better logging and diagnostics

### 📝 Documentation

- Updated README.md with new features
- Updated CLI-IMPROVEMENTS.md with architecture details
- Updated GSQ-QDRANT-SETUP.md with concise instructions

---

## [1.0.1] - 2026-04-06

### 🐛 Bug Fixes

- Fixed npm publish validation errors
- Improved error messages

---

## [1.0.0] - 2026-04-05

### 🎉 Initial Release

- CLI for automatic GSD + Qdrant setup
- Global installation via npm
- Knowledge base indexing in any Node.js project
- MCP integration for vector search
- Post-commit automation
