# GSD + Qdrant Setup

**Project-scoped collections:** `{project-name}-docs` e `{project-name}-snippets`

---

## Quick Start

```bash
# Install CLI
npm install -g gsd-qdrant-cli

# Start Qdrant
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant

# Setup project
cd /your/project
gsd-qdrant
```

---

## How It Works

**Collection naming:**
- `{project-name}-docs` → `.md` files in `.gsd/`
- `{project-name}-snippets` → all other source files

**Supported extensions:** `.md`, `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.go`, `.rs`, `.sql`, `.json`, `.yml`, `.yaml`

**Indexing:**
- `.gsd/` artifacts (PROJECT, REQUIREMENTS, DECISIONS, KNOWLEDGE)
- Milestone/slice/task files (M001/S01/T01/*.md)
- Code snippets with embeddings

**Automation:**
- Post-commit: `npm run sync-knowledge`
- Watcher: auto-sync in non-production

---

## MCP Queries

```javascript
// Find component pattern
mcp_call("qdrant", "qdrant-find", {
  query: "navbar header navigation component"
})

// Find decision
mcp_call("qdrant", "qdrant-find", {
  query: "decision dark palette"
})

// Search with context
mcp_call("qdrant", "qdrant-find", {
  query: "file operations fs",
  withContext: true
})
```

---

## Configuration

**Environment variables:**
```bash
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your_key
VECTOR_NAME=fast-all-minilm-l6-v2
```

**Troubleshooting:**
- `vector-name errors` → Recreate collection with named vector
- `Watcher doesn't update` → Check `NODE_ENV !== production`
- `Hook doesn't run` → Verify `.git/hooks/` exists

---

**Version:** 1.0.2  
**Updated:** April 2026
