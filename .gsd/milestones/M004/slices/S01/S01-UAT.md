# S01: Creare modulo auto-retrieve-instructions.js — UAT

**Milestone:** M004
**Written:** 2026-04-18T17:49:10.095Z

## UAT - M004 S01

### Test 1: Creazione modulo
- **Azione:** node -e "const m = require('./src/auto-retrieve-instructions'); console.log(typeof m.ensureAutoRetrieveInstructions)"
- **Risultato:** function

### Test 2: Prima esecuzione
- **Azione:** ensureAutoRetrieveInstructions()
- **Risultato:** 📝 Created ~/.gsd/agent/KNOWLEDGE.md (auto-retrieve instructions)

### Test 3: Seconda esecuzione (dedup)
- **Azione:** ensureAutoRetrieveInstructions()
- **Risultato:** ℹ️ Auto-retrieve instructions already in KNOWLEDGE.md

### Test 4: Contenuto file
- **Verifica:** grep -c "Cross-Project Knowledge Retrieval" → 1
