# S03: Aggiornare package.json e verificare

**Goal:** Aggiungere src/auto-retrieve-instructions.js al campo files di package.json e testare che il pacchetto includa il nuovo file correttamente
**Demo:** Il pacchetto include il nuovo file e l'installazione funziona su un progetto GSD pulito

## Must-Haves

- "- File incluso in package.json 'files' array\n- Installazione da zero funziona\n- Doppia installazione non duplica contenuti"

## Proof Level

- This slice proves: Not provided.

## Integration Closure

Not provided.

## Verification

- Not provided.

## Tasks

- [x] **T01: Aggiungere il nuovo file a package.json** `est:15min`
  **Step:**
1. Leggere il campo `files` in package.json
2. Aggiungere `src/auto-retrieve-instructions.js` in ordine alfabetico (dopo `auto-retrieve-mcp.js`)
3. Verificare che il formato sia consistente

**File modificati:**
- `package.json`
  - Files: `package.json`
  - Verify: node -e "const p = require('./package.json'); console.log(p.files.includes('src/auto-retrieve-instructions.js'))"

- [x] **T02: Verificare installazione pulita e doppia installazione** `est:30min`
  **Step:**
1. Rimuovere KNOWLEDGE.md se esiste
2. Eseguire CLI bootstrap su un progetto GSD pulito
3. Verificare che il file venga creato
4. Eseguire di nuovo il bootstrap
5. Verificare che non ci sia duplicazione (grep -c = 1)
6. Verificare che il contenuto sia corretto

**Verifica completa:**
- npm pack --dry-run (opzionale, per verificare i file inclusi)
  - Files: `~/.gsd/agent/KNOWLEDGE.md`
  - Verify: grep -c 'Cross-Project Knowledge Retrieval' ~/.gsd/agent/KNOWLEDGE.md → deve essere 1 dopo 2 installazioni

## Files Likely Touched

- package.json
- ~/.gsd/agent/KNOWLEDGE.md
