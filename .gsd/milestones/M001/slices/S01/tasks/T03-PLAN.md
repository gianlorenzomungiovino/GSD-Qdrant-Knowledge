---
estimated_steps: 10
estimated_files: 1
skills_used: []
---

# T03: Aggiungere strumento MCP auto_retrieve

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

## Inputs

- None specified.

## Expected Output

- `src/gsd-qdrant-mcp/index.js`

## Verification

mcp_call(server='gsd-qdrant', tool='auto_retrieve', args={task: 'implementiamo autenticazione JWT'}) deve restituire JSON strutturato con task, keywords, queries, results
