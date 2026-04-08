# Changelog

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
