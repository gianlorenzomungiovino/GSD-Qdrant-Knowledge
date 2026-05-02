---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Aggiornare README.md con documentazione auto_retrieve

Aggiungere sezione completa sulla funzionalità auto_retrieve al README principale, includendo esempi d'uso, parametri e risposta formatata.

## Inputs

- `README.md`
- `src/gsd-qdrant-mcp/README.md`

## Expected Output

- `README.md`

## Verification

grep -c "## Auto-Retrieve" README.md | grep -q ">= 1" && grep -q "auto_retrieve" README.md
