---
estimated_steps: 7
estimated_files: 2
skills_used: []
---

# T03: Implementare group_by max 2 chunk per documento

Aggiungere `group_by` alla query Qdrant per restituire max 1-2 chunk per documento sorgente.

Steps:
1. Nella chiamata Qdrant (dopo prefetch), aggiungere group_by: 'source_doc_path' con group_size: 2
2. Mantenere limit: 5 globale ma limitato ai chunk raggruppati
3. Log: `console.log('[qdrant] group_by: groups=%d, chunks=%d', ...)`

Files: src/cli.js, src/gsd-qdrant-mcp/index.js
Verify: stessa query deve restituire chunk da documenti diversi (no duplicati)

## Inputs

- `src/cli.js`
- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `group_by aggiunto con source_doc_path, max 2 chunk/doc`

## Verification

node src/cli.js context 'embedding model comparison' → doc unici ≥3
