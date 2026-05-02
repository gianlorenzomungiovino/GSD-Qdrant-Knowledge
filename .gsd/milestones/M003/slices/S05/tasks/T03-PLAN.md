---
estimated_steps: 8
estimated_files: 2
skills_used: []
---

# T03: Implementare group_by max 2 chunk per documento

Aggiungere `group_by` alla query Qdrant per restituire massimo 1-2 chunk per documento sorgente.

Steps:
1. Nella chiamata Qdrant (dopo prefetch), aggiungere `group_by: 'source_doc_path'` con `group_size: 2`
2. Mantenere `limit: 5` globale ma limitato ai chunk raggruppati
3. Gestire caso dove group_size > available_chunks per un documento
4. Log: `console.log('[qdrant] group_by: source=%d, chunks=%d', groups.length, totalChunks);`

Files likely touched: `src/cli.js`, `src/gsd-qdrant-mcp/index.js`
Verify: stessa query 3 volte deve restituire chunk da documenti diversi (no duplicati)

## Inputs

- `src/cli.js`
- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `group_by aggiunto alla query Qdrant con source_doc_path`

## Verification

node src/cli.js context 'embedding model comparison' → verificare che non ci siano più di 2 chunk dallo stesso file sorgente; numero documenti unici ≥3
