---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T02: Verificare installazione pulita e doppia installazione

**Step:**
1. Rimuovere KNOWLEDGE.md se esiste
2. Eseguire CLI bootstrap su un progetto GSD pulito
3. Verificare che il file venga creato
4. Eseguire di nuovo il bootstrap
5. Verificare che non ci sia duplicazione (grep -c = 1)
6. Verificare che il contenuto sia corretto

**Verifica completa:**
- npm pack --dry-run (opzionale, per verificare i file inclusi)

## Inputs

- None specified.

## Expected Output

- `Verifica installazione pulita e doppia installazione`

## Verification

grep -c 'Cross-Project Knowledge Retrieval' ~/.gsd/agent/KNOWLEDGE.md → deve essere 1 dopo 2 installazioni
