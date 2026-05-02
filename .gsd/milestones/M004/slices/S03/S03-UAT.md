# S03: Aggiornare package.json e verificare — UAT

**Milestone:** M004
**Written:** 2026-04-18T17:47:48.977Z

## UAT - M004 S03

### Test 1: Installazione pulita
- **Azione:** `rm ~/.gsd/agent/KNOWLEDGE.md && gsd-qdrant-knowledge` su progetto GSD
- **Risultato:** `📝 Created: ~/.gsd/agent/KNOWLEDGE.md (auto-retrieve instructions)`
- **Verifica:** `grep -c "Cross-Project Knowledge Retrieval"` → 1

### Test 2: Doppia installazione
- **Azione:** Ripetere `gsd-qdrant-knowledge` sullo stesso progetto
- **Risultato:** `ℹ️  Auto-retrieve instructions already in KNOWLEDGE.md`
- **Verifica:** `grep -c "Cross-Project Knowledge Retrieval"` → 1 (nessuna duplicazione)

### Test 3: package.json
- **Azione:** Verificare che il file sia incluso nel pacchetto
- **Risultato:** `package.files.includes('src/auto-retrieve-instructions.js')` → true
