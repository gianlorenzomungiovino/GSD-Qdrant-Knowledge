# GSD + Qdrant CLI

Template per rendere il sync della knowledge base GSD ripetibile tra progetti diversi.

## Installazione Rapida

### Installazione Globale

```bash
# Installa la CLI globalmente su npm
npm install -g gsd-qdrant-cli

# Verifica l'installazione
gsd-qdrant --version
```

### Uso in un Progetto

```bash
# In qualsiasi progetto Node.js
gsd-qdrant
```

### Esempio: Applicare un Template

```bash
# Applicare il template GSD + Qdrant in un progetto esistente
gsd-qdrant

# Oppure specifica un template specifico
gsd-qdrant apply gsd-setup-templates
```

### Esempio: Query della Knowledge Base

```bash
# Cerca snippet di codice specifici
gsd-qdrant snippet search 'authentication'
gsd-qdrant snippet search 'database' --type=function --language=typescript

# Esporta i risultati
gsd-qdrant snippet search 'api' --export=results.json
```

## Come Funziona

Il template **NON** viene copiato nel progetto target. I file template risiedono nella collection Qdrant `gsd-setup-templates` e vengono scaricati direttamente al momento del setup.

**Cosa fa la CLI:**
1. Installa `@qdrant/js-client-rest` e `@xenova/transformers`
2. Scarica i template da Qdrant
3. Crea i file nel progetto target
4. Esegue la prima sync

## Prerequisiti

- Docker (Qdrant server)
- Node.js 18+
- Python 3.10+ con: `mcp`, `qdrant-client`, `fastembed`

```bash
python -m pip install mcp qdrant-client fastembed
```

## Setup Completo

1. **Avvia Qdrant:**
   ```bash
   docker run -d --name qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
   ```

2. **Esegui la CLI:**
   ```bash
   gsd-qdrant
   ```

3. **Avvia il progetto:**
   ```bash
   npm run dev
   ```

## Cosa Viene Indicizzato

- File `.md` in `.gsd/` (decisioni, requisiti, milestone, slice, task)
- Code-context per componenti frontend chiave
- Snippet di codice (funzioni, classi, config) con embeddings

## Interrogare la Knowledge Base

```javascript
// MCP locale del progetto
mcp_call("qdrant", "qdrant-find", {
  query: "navbar header navigation pill nav component"
})

// Cross-project
mcp_call("project-registry", "project_knowledge_search", {
  project: "website-agency",
  query: "navbar header navigation pill nav component",
  limit: 5
})
```

## Comandi CLI

```bash
# Configurazione
gsd-qdrant

# Ricerca snippet
gsd-qdrant snippet search 'authentication'
gsd-qdrant snippet search 'database' --type=function --language=typescript
gsd-qdrant snippet search 'api' --export=results.json
```

## Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| Vector search non funziona | Ricrea collection con named vector `fast-all-minilm-l6-v2` |
| Watcher non parte | Verifica `src/server.js` e `NODE_ENV` non-production |
| Cross-project search fallisce | Controlla registry Qdrant e dipendenze Python |

## Struttura dei Milestone

| Milestone | Status |
|-----------|--------|
| M001: CLI Creation and Testing | ✅ Complete |
| M002: Testing and Publishing | ✅ Complete |
| M003: Code Snippets Database | ✅ Complete |

## Documentazione Dettagliata

- [`GSQ-QDRANT-SETUP.md`](GSQ-QDRANT-SETUP.md) - Istruzioni di setup complete
- [`CLI-IMPROVEMENTS.md`](CLI-IMPROVEMENTS.md) - Dettagli tecnici e architettura

## License

[Da definire]

---

**Version:** 1.0.0  
**Updated:** April 2026
