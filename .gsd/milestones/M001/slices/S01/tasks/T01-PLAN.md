---
estimated_steps: 6
estimated_files: 1
skills_used: []
---

# T01: Aggiungere funzioni di estrazione parole chiave (extractKeywordsFromTask)

Implementare la logica di estrazione delle parole chiave è il primo passo fondamentale per il retrieval automatico

**Steps:**
1. Aggiungere la funzione `extractKeywordsFromTask` che analizza il task dell'utente
2. Implementare pattern matching per categorie comuni: autenticazione/login, componenti/widget, API/endpoint, database/modello, form/input
3. Mantenere il caso originale della parola chiave nel task
4. Rimuovere duplicati mantenendo l'ordine di apparizione

## Inputs

- None specified.

## Expected Output

- `src/gsd-qdrant-mcp/index.js`

## Verification

node -e "const {extractKeywordsFromTask} = require('./src/gsd-qdrant-mcp/index.js'); const ks = extractKeywordsFromTask('implementiamo autenticazione JWT e componenti React'); if (ks.length >= 2 && ks.includes('autenticazione') && ks.includes('componenti')) { console.log('PASS'); process.exit(0); } else { console.log('FAIL'); process.exit(1); }"
