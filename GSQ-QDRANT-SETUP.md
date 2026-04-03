# GSD + Qdrant Setup from Templates

This template makes GSD knowledge sync repeatable across projects: one Qdrant collection per project, one MCP config shape, one sync library contract.

## What it provides

When you run the setup script, it downloads and installs:
- `lib/gsd-qdrant-sync/index.js` — sync library for `.gsd` markdown artifacts
- `.gsd/mcp.json` — MCP servers for project knowledge + template lookup
- `GSQ-QDRANT-SETUP.md` — local setup instructions copied into the target project
- automatic `.git/hooks/post-commit` installation for local commit sync
- automatic patching of `src/server.js` (when present) so the watcher starts outside production
- this entire `qdrant-template/` folder, so the project stays self-describing

## Collection contract

Each project gets its own collection:
- `<project-name>-gsd`

Examples:
- `website-agency-gsd`
- `client-alpha-gsd`
- `internal-dashboard-gsd`

The sync library writes **named vectors** using the MCP-compatible vector name:
- `fast-all-minilm-l6-v2`

That alignment matters. If the collection was created earlier with unnamed vectors, MCP search will fail until the collection is recreated or migrated.

## What gets indexed

The sync library indexes `.md` files under `.gsd/` except runtime-only folders:
- `.gsd/PROJECT.md`
- `.gsd/REQUIREMENTS.md`
- `.gsd/DECISIONS.md`
- `.gsd/KNOWLEDGE.md`
- milestone / slice / task artifacts

For each document it stores:
- `type` — decision, requirement, plan, summary, context, etc.
- `scope` — project, milestone, slice, task
- `path` — relative project path
- `project` — current project folder name
- `collection` — active collection name
- `milestone`, `slice`, `task` — extracted from directory IDs only
- `content` — searchable text payload with lightweight labels prepended

## Automation model

After setup, knowledge sync is automatic in two ways:

1. **Post-commit sync**
   - Every local git commit runs `npm run sync-knowledge`
2. **Watcher sync in app runtime**
   - If `src/server.js` exists and the app is not in production, the setup script patches it to auto-start the watcher

This means the common case is:
- edit `.gsd`
- run the app locally
- commit normally
- Qdrant stays current without a manual step

## One-command setup for a new or existing project

1. Copy the template folder to the project root.
2. Run the setup script from the project root:

```bash
node qdrant-template/scripts/setup-from-templates.js
```

Project name is auto-detected from `package.json` when available. Otherwise the root folder name is used.

3. Install dependencies if needed:

```bash
npm install
```

4. Run the project as usual.

## Requirements

- Qdrant must be reachable at `QDRANT_URL` (default `http://localhost:6333`)
- Node.js 18+
- a `package.json` at the project root or app root
- git repository if you want the post-commit hook installed

## Environment variables

Optional overrides:
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `VECTOR_NAME` — defaults to `fast-all-minilm-l6-v2`
- `EMBEDDING_MODEL` — MCP-side model label, defaults to `sentence-transformers/all-MiniLM-L6-v2`
- `EMBEDDING_DIMENSIONS` — defaults to `384`
- `LOCAL_EMBEDDING_MODEL` — local sync embedder, defaults to `Xenova/all-MiniLM-L6-v2`

## Querying the knowledge base

The project-level MCP server exposes:
- `qdrant-find`
- `qdrant-store`

Typical query styles that work better than vague prompts:

### Find a component pattern
```javascript
mcp_call("qdrant", "qdrant-find", {
  query: "navbar header navigation pill nav component"
})
```

### Find a prior decision
```javascript
mcp_call("qdrant", "qdrant-find", {
  query: "decision dark palette green ochre"
})
```

### Find milestone context
```javascript
mcp_call("qdrant", "qdrant-find", {
  query: "M002 deploy content analytics favicon social links"
})
```

### Search setup templates
```javascript
mcp_call("qdrant-templates", "qdrant-find", {
  query: "setup qdrant sync mcp collection project"
})
```

## Cross-project reuse

The current template guarantees **one collection per project**. That gives consistent storage and querying.

For prompts like:
- "utilizziamo il componente della navbar del progetto X"

You still need a way to resolve **which project** and **which collection** to search. The template handles the collection naming convention; cross-project discovery should be layered on top via either:
- a central registry of projects → collections, or
- a custom MCP server that dispatches to the right project collection

This template is the storage foundation, not the full cross-project orchestration layer.

## Troubleshooting

### MCP search returns vector-name errors
Your collection was probably created with unnamed vectors. Recreate or migrate it so it uses the named vector:
- `fast-all-minilm-l6-v2`

### Watcher starts but no updates appear
- Ensure the app is running outside production
- Ensure `.gsd` files are actually changing
- Check whether the target project has the patched `src/server.js`

### Commit hook does not run
- Ensure `.git/hooks/` exists
- Ensure the repository is writable
- Re-run the setup script after git init

### Sync succeeds but results are poor
The system indexes `.gsd` artifacts, not the entire codebase. If you want component reuse queries to work better, add code-context summaries for key components into `.gsd` artifacts.

## Recommended next layer

For serious cross-project reuse, add one of these on top of the template:
- a `gsd-project-index` collection containing project → collection metadata
- a custom MCP server exposing higher-level tools like `project_knowledge_search(project, query)`

That gives a natural chat flow while keeping the underlying storage contract stable.
