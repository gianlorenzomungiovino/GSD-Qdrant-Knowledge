---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T01: Scrivere unit tests per funzioni core

Testare le funzioni di base che estraggono keyword e generano query assicura che la logica fondamentale sia corretta prima di testare l'integrazione completa

## Inputs

- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `tests/auto-retrieve.unit.test.js`

## Verification

npm test -- --testNamePattern "S02-core" passa con coverage >80%
