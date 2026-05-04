---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T01: Integrare ensureAutoRetrieveInstructions() in bootstrapProject()

**Step:**\n1. Leggere il blocco `bootstrapProject()` in cli.js (righe ~307-342)\n2. Aggiungere import di `ensureAutoRetrieveInstructions` dopo `createGsdQdrantDirectory()`\n3. Chiamare `ensureAutoRetrieveInstructions()` nel flusso bootstrap\n4. Verificare che l'installazione completa funzioni\n\n**Dettagli:**\n- La chiamata va inserita dopo `createGsdQdrantDirectory()` e prima di `ensureToolMcpConfig()`\n- Il modulo è in `src/auto-retrieve-instructions.js` (nella stessa directory di cli.js)\n- La funzione può essere chiamata in modo sincrono (nessuna async necessaria)\n\n**File modificati:**\n- `src/cli.js`\n\n**Verifica:**\n- Eseguire il bootstrap su un progetto GSD\n- Verificare che KNOWLEDGE.md venga creato/aggiornato durante l'installazione"

## Inputs

- `src/auto-retrieve-instructions.js (modulo appena creato)`
- `src/cli.js (bootstrapProject function)`

## Expected Output

- `cli.js modificato per chiamare ensureAutoRetrieveInstructions()`

## Verification

node src/cli.js --version (non deve rompere il CLI) + test bootstrap su progetto GSD"
