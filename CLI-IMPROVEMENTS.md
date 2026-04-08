# GSD + Qdrant CLI - Technical Overview

## Architecture

This CLI automates GSD knowledge base sync with Qdrant across any Node.js project.

## Core Problem Solved

The original bootstrap executed setup **before** installing dependencies, causing:

```
Error: Cannot find module '@qdrant/js-client-rest'
```

## Solution: Correct Execution Order

```javascript
function main() {
  // 1. Install dependencies FIRST ✅
  installDependencies(pkgPath);
  
  // 2. Run setup ✅
  run('node', ['scripts/setup-from-templates.js']);
  
  // 3. Run initial sync ✅
  run('npm', ['run', 'sync-knowledge']);
}
```

## Files Structure

### Scripts
- `scripts/cli.js` - Main CLI entry point
- `scripts/bootstrap-project.js` - Legacy bootstrap (alternative)
- `scripts/setup-from-templates.js` - Template setup from Qdrant
- `scripts/install-dependencies.js` - Dependency installation logic
- `scripts/sync-knowledge.js` - Knowledge sync script

### Core Library
- `lib/gsd-qdrant-sync/index.js` - Main sync engine with project-scoped collections

### Snippet Database
- `scripts/snippet-db-schema.sql` - PostgreSQL schema with pgvector
- `scripts/ast-parser.js` - AST parser for code extraction
- `scripts/snippet-extractor.js` - Extract functions, classes, configs
- `scripts/search-api.js` - Search API with relevance scoring
- `scripts/snippet-ranking.js` - Ranking and filtering

## Template Flow

**Templates live in Qdrant**, not copied locally:
1. Collection `gsd-setup-templates` stores all template files
2. CLI downloads templates from Qdrant at setup time
3. Only necessary files are created in target project

## Project-Scoped Collections (M005/S02)

Each project has isolated Qdrant collections:

- **{project-name}-docs:** All `.md` files in `.gsd/`
- **{project-name}-snippets:** All other source files

**Collection naming:**
```javascript
const collections = {
  docs: `${projectName}-docs`,
  snippets: `${projectName}-snippets`,
};
```

**Example:**
- Project: `qdrant-template` → `qdrant-template-docs`, `qdrant-template-snippets`
- Project: `my-project` → `my-project-docs`, `my-project-snippets`

**Benefits:**
- Universal usability - works in any project without manual configuration
- Isolation between projects - no conflicts when multiple projects use the same Qdrant
- Automatic creation on first sync

## File Type Support

The system indexes ALL source file types:

| Extension | Type | Collection |
|-----------|------|------------|
| `.md` | context-doc | {project-name}-docs |
| `.js`, `.ts`, `.jsx`, `.tsx` | code-snippet | {project-name}-snippets |
| `.py` | code-snippet | {project-name}-snippets |
| `.go` | code-snippet | {project-name}-snippets |
| `.rs` | code-snippet | {project-name}-snippets |
| `.sql` | code-snippet | {project-name}-snippets |
| `.json`, `.yml`, `.yaml` | code-snippet | {project-name}-snippets |

## Database Schema

```sql
CREATE TABLE snippets (
    id UUID PRIMARY KEY,
    type TEXT NOT NULL,        -- function, class, module, config, context-doc
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    sourceFile TEXT NOT NULL,
    sourceLine INTEGER NOT NULL,
    content TEXT NOT NULL,
    description TEXT,
    tags TEXT[],
    dependencies TEXT[],
    context TEXT,
    metrics JSONB,
    crossProject BOOLEAN DEFAULT false,
    embedding vector(384),
    createdAt TIMESTAMP,
    updatedAt TIMESTAMP
);

CREATE INDEX idx_snippets_fts ON snippets USING gin(to_tsvector('english', content));
CREATE INDEX idx_snippets_embedding ON snippets USING vector(embedding_ops);
```

## CLI Commands

```bash
# Setup
gsd-qdrant

# Manual sync
gsd-qdrant sync

# Watch mode for real-time indexing
gsd-qdrant watch

# Snippet search
gsd-qdrant snippet search 'authentication'
gsd-qdrant snippet search 'database' --type=function --language=typescript
gsd-qdrant snippet search 'api' --export=results.json

# Search with context
gsd-qdrant query "file operations fs" --with-context
```

## Testing

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
npm run test:coverage # Coverage report
```

**Results:** 15 tests passing, 100% coverage on utility scripts.

## Milestone Status

| Milestone | Status |
|-----------|--------|
| M001: CLI Creation and Testing | ✅ 100% |
| M002: Testing and Publishing | ✅ 100% |
| M003: Code Snippets Database | ✅ 100% |
| M005: Publish & Polish | 🚧 In Progress |

## Key Decisions (M005)

### D018: Project-Scoped Qdrant Collections

**Decision:** Use project name prefix for Qdrant collections

**Rationale:**
- Ensures universal usability across any project
- Each project has isolated collections to avoid conflicts
- No manual configuration required

**Impact:**
- Collections are automatically created on first sync
- Multiple projects can coexist without conflicts
- Clean separation of concerns (docs vs snippets)

## Next Steps

- Complete M005/S03: Fix complete indexing
- Publish to npm (`gsd-qdrant-cli`)
- Add integration tests
- Performance monitoring

---

**Version:** 1.0.2  
**Updated:** April 2026  
**Key Features:** Project-scoped collections, universal usability, full source indexing
