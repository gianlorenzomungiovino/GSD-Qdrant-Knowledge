# S01: Implementare strumento auto_retrieve

**Goal:** Implementare lo strumento MCP `auto_retrieve` con funzioni di estrazione parole chiave e generazione query automatiche
**Demo:** L'MCP server ha un nuovo strumento `auto_retrieve`

## Must-Haves

- Not provided.

## Proof Level

- This slice proves: Not provided.

## Integration Closure

Not provided.

## Verification

- Not provided.

## Tasks

- [x] **T01: Aggiungere funzioni di estrazione parole chiave (extractKeywordsFromTask)** `est:10-15 min`
  Implementare la logica di estrazione delle parole chiave è il primo passo fondamentale per il retrieval automatico

**Steps:**
1. Aggiungere la funzione `extractKeywordsFromTask` che analizza il task dell'utente
2. Implementare pattern matching per categorie comuni: autenticazione/login, componenti/widget, API/endpoint, database/modello, form/input
3. Mantenere il caso originale della parola chiave nel task
4. Rimuovere duplicati mantenendo l'ordine di apparizione
  - Files: `src/gsd-qdrant-mcp/index.js`
  - Verify: node -e "const {extractKeywordsFromTask} = require('./src/gsd-qdrant-mcp/index.js'); const ks = extractKeywordsFromTask('implementiamo autenticazione JWT e componenti React'); if (ks.length >= 2 && ks.includes('autenticazione') && ks.includes('componenti')) { console.log('PASS'); process.exit(0); } else { console.log('FAIL'); process.exit(1); }"

- [x] **T02: Aggiungere funzione di generazione query (generateSearchQueries)** `est:5-10 min`
  Limitare le query massimizza l'efficienza del retrieval e previene sovraccarico del database Qdrant

**Steps:**
1. Aggiungere la funzione `generateSearchQueries`
2. Se keywords.length === 0, usare il task intero come fallback
3. Se keywords.length === 1, usare la singola keyword
4. Se keywords.length >= 2, generare [keywords[0], keywords[0] + ' ' + keywords[1]] (max 2 query)
  - Files: `src/gsd-qdrant-mcp/index.js`
  - Verify: node -e "const {generateSearchQueries} = require('./src/gsd-qdrant-mcp/index.js'); const q = generateSearchQueries(['autenticazione', 'JWT', 'oauth']); if (q.length === 2 && q[0] === 'autenticazione' && q[1] === 'autenticazione JWT') { console.log('PASS'); process.exit(0); } else { console.log('FAIL: expected 2 queries'); process.exit(1); }"

- [x] **T03: Aggiungere strumento MCP auto_retrieve** `est:20-30 min`
  Esporre lo strumento MCP è il passo finale per rendere disponibile la funzionalità auto-retrieve ai clienti

**Steps:**
1. Aggiungere registration dello strumento `auto_retrieve` nel server MCP
2. Implementare la logica: estrai keywords → genera query → esegui search su Qdrant per ogni query
3. Rimuovi duplicati dai risultati (stesso id appare in più query)
4. Ordina risultati per relevance score decrescente
5. Limita output a limit risultati (default: 3)
6. Include contenuto completo solo per il top-1 risultato (se includeContent=true)
7. Aggiungi logging via console.error per debug
8. Gestisci errori con return isError: true
  - Files: `src/gsd-qdrant-mcp/index.js`
  - Verify: mcp_call(server='gsd-qdrant', tool='auto_retrieve', args={task: 'implementiamo autenticazione JWT'}) deve restituire JSON strutturato con task, keywords, queries, results

- [x] **T04: Aggiungere logging del tipo di matching** `est:30m`
  Loggare se la query è stata soddisfatta principalmente da vector o text matching
  - Files: `src/knowledge-sharing.js`
  - Verify: Check dei log in output

- [x] **T05: Test e benchmark** `est:3h`
  Testare su 50 query di test, verificare improvement >10% vs vettoriale puro
  - Verify: Benchmark report con improvement metrics

## Files Likely Touched

- src/gsd-qdrant-mcp/index.js
- src/knowledge-sharing.js
