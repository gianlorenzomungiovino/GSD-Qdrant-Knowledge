---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: Scrivere integration tests per MCP server

Testare lo strumento MCP tramite stdio assicura che l'interfaccia di comunicazione funzioni correttamente e che i risultati siano formattati come atteso

## Inputs

- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `tests/auto-retrieve.integration.test.js`

## Verification

npm test -- --grep "S02-integration" passa
