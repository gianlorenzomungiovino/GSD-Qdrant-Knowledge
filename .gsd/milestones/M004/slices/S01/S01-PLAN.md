# S01: Creare modulo auto-retrieve-instructions.js

**Goal:** Creare src/auto-retrieve-instructions.js che gestisce la scrittura delle istruzioni in ~/.gsd/agent/KNOWLEDGE.md con deduplication via marker
**Demo:** Il modulo esiste ed esporta ensureAutoRetrieveInstructions()

## Must-Haves

- "- File creato con modulo exportato\n- Funzione controlla se istruzione già presente (marker)\n- Crea directory ~/.gsd/agent/ se non esiste\n- Append-only: non sovrascrive contenuto esistente\n- Doppia esecuzione non duplica contenuti"

## Proof Level

- This slice proves: Not provided.

## Integration Closure

Not provided.

## Verification

- Not provided.

## Tasks

- [x] **T01: Creare src/auto-retrieve-instructions.js** `est:1h`
  Creare il modulo che:
1. Esporta ensureAutoRetrieveInstructions()
2. Legge ~/.gsd/agent/KNOWLEDGE.md (se esiste)
3. Controlla se la sezione 'Cross-Project Knowledge Retrieval (Qdrant)' è già presente (marker-based dedup)
4. Se non presente, crea la directory ~/.gsd/agent/ se necessaria e appende la sezione
5. Stampa console log appropriato

La sezione da appendere:
- Intestazione: ## Cross-Project Knowledge Retrieval (Qdrant)
- Spiega quando usare auto_retrieve
- Spiega come usarlo con esempio di chiamata
- Nota che il MCP server deve essere configurato in .mcp.json
  - Files: `src/auto-retrieve-instructions.js`
  - Verify: node -e "const m = require('./src/auto-retrieve-instructions'); console.log(typeof m.ensureAutoRetrieveInstructions)"

- [x] **T02: Testare il modulo standalone** `est:30min`
  Testare il modulo:
1. Eseguire ensureAutoRetrieveInstructions()
2. Verificare che ~/.gsd/agent/KNOWLEDGE.md venga creato con la sezione corretta
3. Eseguire di nuovo per verificare deduplication (nessuna duplicazione)
4. Verificare il contenuto del file
  - Files: `~/.gsd/agent/KNOWLEDGE.md`
  - Verify: cat ~/.gsd/agent/KNOWLEDGE.md | grep -c 'Cross-Project Knowledge Retrieval' (deve essere 1 dopo 2 esecuzioni)

## Files Likely Touched

- src/auto-retrieve-instructions.js
- ~/.gsd/agent/KNOWLEDGE.md
