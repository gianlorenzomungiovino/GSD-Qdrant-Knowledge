# GSD + Qdrant CLI

CLI globale per configurare automaticamente una knowledge base GSD indicizzata in Qdrant in qualsiasi progetto Node.js.

## Procedura di Installazione

### 1. Installa la CLI Globalmente (una volta)

```bash
# Installa da npm (pubblicato come gsd-qdrant-cli)
npm install -g gsd-qdrant-cli

# Verifica l'installazione
gsd-qdrant --version
```

### 2. Avvia Qdrant Server

```bash
docker run -d --name qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

### 3. Usa in un Progetto Node.js

```bash
# In qualsiasi progetto Node.js con package.json
cd /percorso/tuo-progetto
gsd-qdrant
```

La CLI:
1. Installa `@qdrant/js-client-rest` e `@xenova/transformers`
2. Scarica i template dalla collection Qdrant `gsd-setup-templates`
3. Crea i file necessari nel progetto
4. Esegue l'indicizzazione iniziale

### 4. Esegui il Progetto

```bash
npm run dev
```

Da questo momento, ogni commit git eseguirà automaticamente l'indicizzazione della knowledge base.

---

## Comandi CLI

```bash
# Setup completo in un progetto
gsd-qdrant

# Ricerca snippet con keyword matching
gsd-qdrant snippet search 'authentication'
gsd-qdrant snippet search 'database' --type=function --language=typescript

# Applica uno snippet con intent detection
gsd-qdrant snippet apply "script per docker"
```

---

## Prerequisiti

- **Node.js** 18+
- **Docker** (per Qdrant server)
- **Python** 3.10+ con: `mcp`, `qdrant-client`, `fastembed`

```bash
python -m pip install mcp qdrant-client fastembed
```

- **Git** (per il post-commit hook automatico)

---

## Come Funziona

I file template **non** vengono copiati localmente. Risiedono nella collection Qdrant `gsd-setup-templates` e vengono scaricati al momento del setup.

**Cosa viene creato nel progetto:**
- `lib/gsd-qdrant-sync/index.js` — Libreria di sync
- `.mcp.json` — Configurazione MCP servers
- `.git/hooks/post-commit` — Hook per sync automatica
- Patch di `src/server.js` (se presente) per avviare il watcher

**Cosa viene indicizzato:**
- File `.md` in `.gsd/` (PROJECT, REQUIREMENTS, DECISIONS, KNOWLEDGE)
- Artifact milestone/slice/task (M001/S01/T01/*.md)
- Snippet di codice con embeddings (funzioni, classi, config)

**Automazione:**
- **Post-commit:** Ogni commit git esegue `npm run sync-knowledge`
- **Watcher:** Se in ambiente non-production, il watcher indicizza in tempo reale

---

## Interrogare la Knowledge Base

```javascript
// Cerca pattern di componenti
mcp_call("qdrant", "qdrant-find", {
  query: "navbar header navigation pill nav component"
})

// Trova una decisione architettonica
mcp_call("qdrant", "qdrant-find", {
  query: "decision dark palette green ochre"
})

// Cerca contesto milestone
mcp_call("qdrant", "qdrant-find", {
  query: "M002 deploy content analytics"
})
```

---

## Configurazione Avanzata

### Variabili d'Ambiente

```bash
export QDRANT_URL=http://localhost:6333
export QDRANT_API_KEY=your_api_key
export VECTOR_NAME=fast-all-minilm-l6-v2
export LOCAL_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
```

### Collection per Progetto

Ogni progetto ha una collection dedicata: `<project-name>-gsd`

Esempi:
- `website-agency-gsd`
- `client-alpha-gsd`
- `internal-dashboard-gsd`

---

## Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| `Cannot find module '@qdrant/js-client-rest'` | La CLI installa automaticamente le dipendenze - se fallisce, esegui `npm install` manualmente |
| Vector search non funziona | Ricrea la collection con named vector `fast-all-minilm-l6-v2` |
| Watcher non parte | Verifica `src/server.js` esiste e `NODE_ENV` non è `production` |
| Post-commit hook non esegue | Controlla che `.git/hooks/` esista e sia scrivibile |
| Cross-project search fallisce | Verifica la registry Qdrant e le dipendenze Python |

---

## Documentazione

- [`GSQ-QDRANT-SETUP.md`](GSQ-QDRANT-SETUP.md) — Istruzioni complete di setup e contratto Qdrant
- [`CLI-IMPROVEMENTS.md`](CLI-IMPROVEMENTS.md) — Architettura tecnica e dettagli di implementazione

---

**Version:** 1.0.1  
**Updated:** April 2026
