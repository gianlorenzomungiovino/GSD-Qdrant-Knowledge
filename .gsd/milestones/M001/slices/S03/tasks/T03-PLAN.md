---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T03: Verificare integrazione end-to-end

Creare test di integrazione end-to-end che valida il flusso completo: richiesta → estrazione keyword → query Qdrant → risultato formattato.

## Inputs

- `tests/auto-retrieve.integration.test.js`
- `scripts/validate-auto-retrieve.js`

## Expected Output

- `tests/e2e-auto-retrieve.test.js`

## Verification

npm test -- --testNamePattern "S03" 2>&1 | grep -q "passed"
