---
estimated_steps: 17
estimated_files: 2
skills_used: []
---

# T02: Integrare embedded Qdrant nel bootstrap CLI

# Integrare embedded QDrant nel flusso di bootstrap di `src/cli.js`

## Steps
1. **Import**: in `src/cli.js`, importare `EmbeddedQdrant` da `src/embedded-qdrant.js`
2. **Modificare `bootstrapProject()`**: prima di chiamare sync-knowledge, verificare se QDrant esterno è disponibile usando `GET http://localhost:6333/healthz`. Se la risposta non contiene `{"status":"ok"}`, avviare embedded QDrant.
3. **Swap env vars**: temporaneamente sovrascrivere `QDRANT_URL` a `http://localhost:6333` (se non già impostato) quando si usa embedded
4. **Sync**: eseguire il sync con l'embedded server in funzione
5. **Lasciare QDrant in background**: NON fermare l'embedded server dopo il bootstrap. Lasciarlo in esecuzione con la dashboard accessibile
6. **Graceful shutdown**: registrare handler su `process.on('SIGINT', ...)` e `process.on('SIGTERM', ...)` per fermare l'embedded server prima dell'exit
7. **Aggiornare `uninstallProjectArtifacts()`**: rimuovere solo `.qdrant-data/` se è stato usato embedded QDrant (non se l'utente usa Docker)
8. **Testare il flusso completo**: `node src/cli.js` → dovrebbe partire embedded QDrant automaticamente se non c'è server esterno

## Must-Haves
- [ ] Se un server QDrant esterno è già in esecuzione su localhost:6333 (verificato via /healthz), non viene toccato
- [ ] Se nessun server è disponibile, viene avviato embedded QDrant automaticamente
- [ ] Il sync-knowledge funziona con l'embedded server
- [ ] L'embedded server viene lasciato in esecuzione dopo il bootstrap (non fermato)
- [ ] Il cleanup automatico su SIGINT/SIGTERM è operativo
- [ ] `uninstallProjectArtifacts()` non rimuove lo storage se si usa Docker

## Inputs

- `src/embedded-qdrant.js`
- `src/sync-knowledge.js`
- `src/gsd-qdrant-template.js`

## Expected Output

- `src/cli.js`

## Verification

node src/cli.js 2>&1 | grep -i 'qdrant\|ready\|sync'
