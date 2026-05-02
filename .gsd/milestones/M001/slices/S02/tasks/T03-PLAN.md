---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T03: Creare script di validazione confronto

Confrontare auto_retrieve con query manuali su scenari reali dimostra che il retrieval automatico produce risultati rilevanti e non introduce regressioni

## Inputs

- `src/gsd-qdrant-mcp/index.js`
- `tests/benchmark.test.js`

## Expected Output

- `scripts/validate-auto-retrieve.js`
- `tests/scenarios.json`

## Verification

node scripts/validate-auto-retrieve.js ritorna exit code 0
