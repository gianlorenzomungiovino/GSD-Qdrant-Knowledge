---
estimated_steps: 6
estimated_files: 1
skills_used: []
---

# T01: Aggiungere il nuovo file a package.json

**Step:**
1. Leggere il campo `files` in package.json
2. Aggiungere `src/auto-retrieve-instructions.js` in ordine alfabetico (dopo `auto-retrieve-mcp.js`)
3. Verificare che il formato sia consistente

**File modificati:**
- `package.json`

## Inputs

- `package.json`

## Expected Output

- `package.json aggiornato`

## Verification

node -e "const p = require('./package.json'); console.log(p.files.includes('src/auto-retrieve-instructions.js'))"
