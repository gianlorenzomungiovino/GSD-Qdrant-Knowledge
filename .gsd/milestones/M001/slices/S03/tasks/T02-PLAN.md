---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: Creare esempio di utilizzo CLI

Creare uno script di esempio che dimostra l'uso dello strumento auto_retrieve via CLI MCP, con output formattato.

## Inputs

- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `scripts/example-auto-retrieve.js`

## Verification

test -f scripts/example-auto-retrieve.js && grep -q "auto_retrieve" scripts/example-auto-retrieve.js
