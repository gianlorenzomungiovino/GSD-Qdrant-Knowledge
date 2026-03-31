# GSD + Qdrant Template

Questo template rende il sync della knowledge base GSD ripetibile tra progetti diversi:
- una collection Qdrant per progetto
- un template unico esterno come source of truth
- sync automatico il più possibile
- discovery cross-project tramite registry
- bootstrap iniziale in un solo comando
- MCP custom cross-project sopra registry + Qdrant
- code-context sintetico per componenti chiave
- path derivati dal contesto, non hardcoded sul tuo filesystem personale

Questo README è pensato per essere pushato in una repository e usato anche da altre persone.

---

## 0. Domanda pratica: chi usa il template deve clonare la repo e copiare `qdrant-template/`?

### Risposta breve
**Sì, oggi il flusso più semplice è questo.**

L’utilizzatore tipico deve:
1. clonare o scaricare la repo che contiene il template
2. copiare la cartella `qdrant-template/` nel root del progetto target
3. lanciare il bootstrap

### Perché
Perché il bootstrap e gli script di setup vivono dentro `qdrant-template/`.

### È obbligatorio per sempre?
No.

In futuro si può migliorare con uno di questi modelli:
- package npm installabile
- repo template dedicata da clonare con script di bootstrap remoto
- comando `npx` che scarica il template senza copy manuale

Ma **oggi** il modello supportato e raccomandato è:
- **clone / download del template**
- **copy nel progetto target**
- **bootstrap locale**

---

## 1. Prerequisiti

Servono queste cose installate sulla macchina:

- **Docker Desktop** oppure Docker Engine
- **Node.js 18+**
- **npm**
- **Python 3.10+**
- pacchetti Python:
  - `mcp`
  - `qdrant-client`
  - `fastembed`

Installazione Python consigliata:

```bash
python -m pip install mcp qdrant-client fastembed
```

---

## 2. Checklist secca — dumb-proof

### Step 1 — avvia Qdrant con Docker
```bash
docker run -d --name qdrant \
  -p 6333:6333 \
  -p 6334:6334 \
  qdrant/qdrant
```

Verifica veloce:
```bash
curl http://localhost:6333/collections
```

Se vedi una risposta JSON, Qdrant è attivo.

### Step 2 — copia il template nel progetto target
Copia questa cartella nel root del progetto target con il nome:

- `qdrant-template/`

### Step 3 — esegui il bootstrap
Dal root del progetto target:

```bash
node qdrant-template/scripts/bootstrap-project.js
```

Il bootstrap fa tutto questo da solo:
1. setup del progetto dal template
2. `npm install`
3. prima sync iniziale verso Qdrant
4. generazione di `.gsd/.qdrant-sync-state.json`

### Step 4 — avvia il progetto normalmente
```bash
npm run dev
```

### Step 5 — fine
Da questo punto in poi:
- il sync su commit è automatico
- il watcher in non-production è automatico se il progetto ha `src/server.js`

---

## 3. Cosa fa il sistema

Per ogni progetto GSD:
- indicizza i file `.md` dentro `.gsd/`
- salva embeddings in una collection Qdrant dedicata
- espone la collection tramite MCP locale del progetto
- mantiene un registry centrale dei progetti trovati
- espone un MCP cross-project che risolve il progetto e cerca nella collection giusta
- indicizza anche code-context sintetico per componenti UI chiave

Convention collection:
- `<project-name>-gsd`

Esempi:
- `website-agency-gsd`
- `Gotcha-gsd`
- `vite-project-gsd`

---

## 4. Path-agnostic: cosa significa qui

Gli script non dipendono più da path fissi tipo:
- `D:/Gianlorenzo/Documents/Sviluppo/...`

Ora usano questo ordine:

1. **env vars**, se presenti
2. **posizione reale del template sul disco**
3. path derivati dal progetto corrente

Env vars supportate:
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `VECTOR_NAME`
- `EMBEDDING_MODEL`
- `EMBEDDING_DIMENSIONS`
- `LOCAL_EMBEDDING_MODEL`
- `GSD_QDRANT_TEMPLATE_DIR`
- `GSD_PROJECTS_ROOT`
- `GSD_PROJECT_REGISTRY_PATH`

Questo permette di usare il template anche su altre macchine e altre strutture directory.

---

## 5. File importanti

### Template esterno
- `qdrant-template/README.md`
- `qdrant-template/mcp.json.template`
- `qdrant-template/mcp-project-registry.json.template`
- `qdrant-template/projects-registry.json`
- `qdrant-template/lib/gsd-qdrant-sync/index.js`
- `qdrant-template/scripts/setup-from-templates.js`
- `qdrant-template/scripts/bootstrap-project.js`
- `qdrant-template/scripts/load-gsd-templates.js`

### Nel progetto che usa il template
- `.gsd/mcp.json`
- `.gsd/.qdrant-sync-state.json`
- `apps/api/src/lib/gsd-qdrant-sync/index.js`
- `apps/api/src/scripts/load-gsd-templates.js`
- `apps/api/src/scripts/rebuild-project-registry.js`
- `apps/api/src/scripts/project-knowledge-search.js`
- `apps/api/src/scripts/project_registry_mcp.py`

---

## 6. Serve questo file?

### `.gsd/.qdrant-sync-state.json`
Sì, **serve**.

A cosa serve:
- tiene traccia degli hash dei file già sincronizzati
- evita di ricalcolare embeddings inutilmente
- permette sync incrementale e delete cleanup più affidabili

A cosa **non** serve:
- non è documentazione
- non è knowledge da interrogare
- non va considerato un artifact utente

In pratica:
- **tenerlo**: sì
- **modificarlo a mano**: no
- **committarlo**: opzionale; normalmente meglio trattarlo come stato runtime locale

### Viene creato automaticamente?
Sì.

Non viene creato "dal bootstrap" in astratto, ma dal fatto che il bootstrap esegue la **prima sync**. Quando la prima sync salva il suo stato, il file compare automaticamente.

---

## 7. Cosa viene indicizzato

### Artifact GSD
Il sync legge i `.md` dentro `.gsd/`, esclusi i folder runtime puri.

### Code-context sintetico
Oltre agli artifact GSD, vengono indicizzati automaticamente anche componenti chiave del frontend.

Nel setup attuale:
- `apps/web/src/components/Header.jsx`
- `apps/web/src/components/PillNav.jsx`
- `apps/web/src/components/Footer.jsx`
- `apps/web/src/components/GridDistortionHero.jsx`
- `apps/web/src/components/Hero.jsx`
- `apps/web/src/components/HomeProjectsScroller.jsx`
- `apps/web/src/components/ProjectCard.jsx`

Per ogni componente il sistema salva:
- `type: code-context`
- `scope: component`
- `componentName`
- `path`
- import principali
- class names principali
- route/link hints
- estratto del sorgente

---

## 8. Setup di un nuovo progetto

### Metodo consigliato: un solo comando
Dal root del progetto:

```bash
node qdrant-template/scripts/bootstrap-project.js
```

Il bootstrap fa:
1. setup da template Qdrant
2. `npm install`
3. prima sync iniziale
4. genera `.gsd/.qdrant-sync-state.json`

### Metodo manuale, se vuoi spezzarlo
```bash
node qdrant-template/scripts/setup-from-templates.js
npm install
cd apps/api
npm run sync-knowledge
```

Se il progetto non ha `apps/api`, il bootstrap prova a usare la root del progetto.

---

## 9. Come interrogare il progetto corrente via MCP

MCP locale del progetto:
- server: `qdrant`

Esempio:
```javascript
mcp_call("qdrant", "qdrant-find", {
  query: "navbar header navigation pill nav component"
})
```

---

## 10. MCP cross-project custom

Il progetto espone anche un server MCP custom aggiuntivo:
- `project-registry`

Tool disponibili:
- `project_registry_list()`
- `project_registry_resolve(project)`
- `project_knowledge_search(project, query, limit=8)`

Esempio:
```javascript
mcp_call("project-registry", "project_knowledge_search", {
  project: "website-agency",
  query: "navbar header navigation pill nav component",
  limit: 5
})
```

---

## 11. Registry cross-project

File:
- `qdrant-template/projects-registry.json`

Contiene:
- `projectKey`
- `packageName`
- `folderName`
- `projectPath`
- `collectionName`
- `gsdPath`
- `mcpPath`
- presenza di `apps/api` o `src/server.js`

---

## 12. Troubleshooting

### Errore MCP: vector name non trovato
La collection è stata creata col vecchio schema unnamed vector.
Serve ricrearla con named vector:
- `fast-all-minilm-l6-v2`

### Il watcher non parte
Controlla:
- che il progetto abbia `src/server.js`
- che non sia in `production`
- che il setup script abbia patchato il server

### Il cross-project search fallisce
Controlla:
- che il progetto sia presente nel registry
- che la collection esista in Qdrant
- che Python abbia `qdrant-client`, `fastembed`, `mcp`

---

## 13. Stato architetturale attuale

- template esterno unico: **sì**
- clone/download + copy nel progetto target: **sì, oggi è il flusso raccomandato**
- path hardcoded personali: **no**
- collection per progetto: **sì**
- registry centrale: **sì**
- bootstrap iniziale a comando unico: **sì**
- progetto corrente interrogabile via MCP: **sì**
- cross-project interrogabile via MCP custom: **sì**
- code-context sintetico per componenti chiave: **sì**
- ricerca federata multi-progetto in un solo colpo: **non ancora**
