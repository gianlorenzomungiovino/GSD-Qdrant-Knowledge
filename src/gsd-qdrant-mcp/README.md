# GSD-Qdrant MCP Server

MCP server per l'auto-retrieval di contesto dalla memoria unificata GSD-Qdrant.

## Funzionalità

Questo server fornisce strumenti per recuperare contesto rilevante dalla collection `gsd_memory` di Qdrant, permettendo l'integrazione del knowledge sharing cross-project nel flusso GSD.

## Strumenti Disponibili

### `auto_retrieve`

Ricerca automatica di contesto cross-project rilevante per un task usando la ricerca semantica su Qdrant.

**Parametri:**

- `task` (required): Il task o query per cui cercare contesto rilevante
- `limit` (optional, default: 3): Numero massimo di risultati da restituire
- `maxQueries` (optional, default: 2): Numero massimo di query da tentare
- `includeContent` (optional, default: false): Includere il contenuto completo nei risultati

**Esempio di risposta:**

```json
{
  "task": "implementazione login",
  "results": [
    {
      "type": "doc",
      "subtype": "decision",
      "project_id": "my-project",
      "source": ".gsd/DECISIONS.md",
      "summary": "Decisione sul sistema di autenticazione",
      "content": null,
      "tags": ["decision", "auth"],
      "language": "markdown",
      "reusable": true,
      "importance": 4,
      "relevance_score": 0.85,
      "match_type": "semantic"
    }
  ],
  "totalResults": 1,
  "projectId": "my-project"
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

## Installazione

Prima installa il pacchetto principale, poi il MCP server:

```bash
npm install -g gsd-qdrant-knowledge
npm install -g gsd-qdrant-mcp
```

Il MCP server richiede `gsd-qdrant-knowledge` come peer dependency.

## Configurazione

Variabili ambiente disponibili:

- `QDRANT_URL`: URL del server Qdrant (default: `http://localhost:6333`)
- `COLLECTION_NAME`: Nome della collection (default: `gsd_memory`)
- `VECTOR_NAME`: Nome del vettore per embedding (default: `fast-all-minilm-l6-v2`)

## Dipendenze

**Runtime:**

- `@modelcontextprotocol/sdk` (^1.29.0)
- `@qdrant/js-client-rest` (^1.17.0)
- `zod` (^4.3.6)

**Peer dependency:**

- `gsd-qdrant-knowledge` (>=2.0.0) — pacchetto principale con `GSDKnowledgeSync`
