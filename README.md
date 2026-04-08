# GSD + Qdrant CLI

CLI globale per configurare automaticamente una knowledge base GSD indicizzata in Qdrant in **qualsiasi progetto Node.js** (frontend-only, backend-only, o full-stack).

## Caratteristiche Principali

- **Project-Scoped Collections:** Ogni progetto ha le proprie collection Qdrant isolate (`{project-name}-gsd`)
- **Universal Usability:** Funziona in qualsiasi progetto Node.js (frontend-only, backend-only, o full-stack) senza configurazione manuale
- **Full Source Indexing:** Indizza tutti i file sorgente, non solo .md (.js, .ts, .jsx, .tsx, .py, .go, .rs, .sql, .json, .yml, .yaml)
- **Context-Aware Search:** Query semantiche con contesto dai file .md di .gsd/
- **Automatic Setup:** Installazione e configurazione automatica delle dipendenze
- **Graceful Degradation:** Funziona anche se i template non sono disponibili o se mancano componenti del progetto

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

**La CLI fa automaticamente:**
1. Installa `@qdrant/js-client-rest` e `@xenova/transformers` (se necessario)
2. Scarica i template dalla collection Qdrant `gsd-setup-templates` (se disponibili)
3. **Crea sempre la collection Qdrant** `{project-name}-gsd`
4. Crea i file necessari nel progetto (se possibili)
5. Installa il post-commit hook per l'indicizzazione automatica

**Nota:** Il setup continua anche se i template non sono disponibili o se mancano componenti del progetto (es. `src/lib`, `src/server.js`).

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

# Sync manuale della knowledge base
gsd-qdrant sync

# Watch mode per indicizzazione in tempo reale
gsd-qdrant watch

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
- **Frontend-only projects:** `.gsd/mcp.json` configurato per usare la collection `{project-name}-gsd`
- **Full-stack projects:** `lib/gsd-qdrant-sync/index.js` — Libreria di sync con collection scoped per progetto
- **Full-stack projects:** `.mcp.json` — Configurazione MCP servers
- **Full-stack projects:** `.git/hooks/post-commit` — Hook per sync automatica
- **Full-stack projects:** Patch di `src/server.js` (se presente) per avviare il watcher

**Cosa viene indicizzato:**
- **Files .md in .gsd/:** PROJECT, REQUIREMENTS, DECISIONS, KNOWLEDGE, SUMMARY, PLAN, UAT
- **Artifact milestone/slice/task:** M001/S01/T01/*.md
- **Code snippets:** .js, .ts, .jsx, .tsx, .py, .go, .rs, .sql, .json, .yml, .yaml

**Automazione:**
- **Post-commit:** Ogni commit git esegue `npm run sync-knowledge` (se disponibile nel progetto)
- **Watcher:** Se in ambiente non-production, il watcher indicizza in tempo reale
- **Frontend-only:** Esegui manualmente `npx node scripts/sync-knowledge.js` o aggiungilo al tuo build process

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

// Cerca snippet con contesto
mcp_call("qdrant", "qdrant-find", {
  query: "file operations fs",
  withContext: true
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

Ogni progetto ha collection dedicate automaticamente create:

- **{project-name}-docs:** Contiene tutti i file .md di `.gsd/`
- **{project-name}-snippets:** Contiene tutti gli altri file sorgente

Esempi:
- `qdrant-template-docs` / `qdrant-template-snippets`
- `website-agency-gsd-docs` / `website-agency-gsd-snippets`
- `client-alpha-docs` / `client-alpha-snippets`

### Estensioni Supportate

Il sistema indicizza automaticamente:
- `.md` (context-doc)
- `.js`, `.ts`, `.jsx`, `.tsx` (JavaScript/TypeScript)
- `.py` (Python)
- `.go` (Go)
- `.rs` (Rust)
- `.sql` (SQL)
- `.json`, `.yml`, `.yaml` (Configuration)

---

## Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| `Cannot find module '@qdrant/js-client-rest'` | La CLI installa automaticamente le dipendenze - se fallisce, esegui `npm install` manualmente |
| Vector search non funziona | Ricrea la collection con named vector `fast-all-minilm-l6-v2` |
| Watcher non parte | Verifica `src/server.js` esiste e `NODE_ENV` non è `production` |
| Post-commit hook non esegue | Controlla che `.git/hooks/` esista e sia scrivibile |
| Cross-project search fallisce | Verifica la registry Qdrant e le dipendenze Python |
| `Not Found` durante setup | Verifica che la collection Qdrant `gsd-setup-templates` esista |
| Frontend-only project non ha sync-knowledge script | Usa `npx node scripts/sync-knowledge.js` manualmente o crea uno script custom |
| Collection non viene creata | Il setup ora crea sempre la collection, anche se fallisce il fetch dei template |

---

## Documentazione

- [`GSQ-QDRANT-SETUP.md`](GSQ-QDRANT-SETUP.md) — Istruzioni complete di setup e contratto Qdrant
- [`CLI-IMPROVEMENTS.md`](CLI-IMPROVEMENTS.md) — Architettura tecnica e dettagli di implementazione
- [`.gsd/KNOWLEDGE.md`](.gsd/KNOWLEDGE.md) — Regole, pattern e lezioni apprese

---

**Version:** 1.0.5  
**Updated:** April 2026  
**Key Features:** Project-scoped collections, universal usability, full source indexing, graceful degradation
