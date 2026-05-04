---
estimated_steps: 11
estimated_files: 1
skills_used: []
---

# T01: Creare src/auto-retrieve-instructions.js

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

## Inputs

- `system-context.js (per capire come KNOWLEDGE.md viene iniettato)`

## Expected Output

- `src/auto-retrieve-instructions.js — modulo funzionante`

## Verification

node -e "const m = require('./src/auto-retrieve-instructions'); console.log(typeof m.ensureAutoRetrieveInstructions)"
