# GSD-Qdrant MCP Server

MCP server per l'auto-retrieval di contesto dalla memoria unificata GSD-Qdrant.

## Funzionalità

Questo server fornisce strumenti per recuperare contesto rilevante dalla collection `gsd_memory` di Qdrant, permettendo l'integrazione del knowledge sharing cross-project nel flusso GSD.

## Strumenti Disponibili

### `retrieve_context`
Ricerca contesto rilevante dalla memoria unificata GSD-Qdrant.

**Parametri:**
- `query` (required): La query dell'utente da cercare
- `limit` (optional, default: 5): Numero massimo di risultati
- `projectId` (optional): Project ID per filtrare risultati specifici
- `includeContent` (optional, default: true): Includere il contenuto completo

**Esempio di risposta:**
```json
{
  "query": "implementazione login",
  "results": [
    {
      "id": "abc123",
      "score": 0.85,
      "type": "doc",
      "subtype": "decision",
      "project_id": "my-project",
      "source": ".gsd/DECISIONS.md",
      "summary": "Decisione sul sistema di autenticazione",
      "content": "...",
      "tags": ["decision", "auth"],
      "language": "markdown",
      "reusable": true,
      "importance": 4
    }
  ],
  "totalFound": 1,
  "filteredByProject": false
}
```

### `list_projects`
Restituisce la lista dei progetti unici indicizzati nella memoria.

**Esempio di risposta:**
```json
{
  "projects": ["my-project", "another-project"],
  "totalProjects": 2
}
```

## Uso con GSD

Questo MCP server può essere chiamato prima di ogni risposta GSD per recuperare contesto rilevante:

```javascript
// Esempio di integrazione come hook beforeMessage
const knowledgeSharing = require('./scripts/knowledge-sharing');

api.on('beforeMessage', async (event, ctx) => {
  await knowledgeSharing.onBeforeMessage(event, ctx);
});
```

## Configurazione

Variabili ambiente disponibili:
- `QDRANT_URL`: URL del server Qdrant (default: `http://localhost:6333`)
- `COLLECTION_NAME`: Nome della collection (default: `gsd_memory`)
- `VECTOR_NAME`: Nome del vettore per embedding (default: `fast-all-minilm-l6-v2`)

## Dipendenze

- `@modelcontextprotocol/sdk`
- `@qdrant/js-client-rest`
- `zod`

## Versione

2.0.0 - Allineato con l'architettura V2.0 di GSD-Qdrant
