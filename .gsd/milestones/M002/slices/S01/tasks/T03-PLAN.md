---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T03: Testare strumento MCP auto_retrieve completo

Testare lo strumento MCP 'auto_retrieve' con il comando mcp_call per verificare che funzioni correttamente l'intero flusso di retrieval automatico.

## Inputs

- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `Risultati di retrieval da Qdrant con metadata e contenuto per il top-1`

## Verification

mcp_call(server='gsd-qdrant', tool='auto_retrieve', args={task: 'implementiamo un sistema di autenticazione con JWT'})
