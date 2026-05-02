---
estimated_steps: 5
estimated_files: 1
skills_used: []
---

# T02: Testare il modulo standalone

Testare il modulo:
1. Eseguire ensureAutoRetrieveInstructions()
2. Verificare che ~/.gsd/agent/KNOWLEDGE.md venga creato con la sezione corretta
3. Eseguire di nuovo per verificare deduplication (nessuna duplicazione)
4. Verificare il contenuto del file

## Inputs

- None specified.

## Expected Output

- `Verifica che il modulo funzioni correttamente`

## Verification

cat ~/.gsd/agent/KNOWLEDGE.md | grep -c 'Cross-Project Knowledge Retrieval' (deve essere 1 dopo 2 esecuzioni)
