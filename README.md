# gsd-qdrant-knowledge

**Knowledge base semantica cross-project per AI coding agents.**

Un agent che reinventa la ruota ogni volta che cambia progetto? Non più. Questo tool indicizza automaticamente `.gsd/` e codice sorgente in una collection Qdrant unificata, poi fa retrieving di contesto rilevante da _altri progetti_ — con scoring intelligente che premia contenuti riutilizzabili e cross-project.

**E non serve mai ricordare di cercarlo.** L'hook inietta contesto rilevante prima di ogni risposta, automaticamente. Zero query manuali. **E zero tokens sprecati a reinventare soluzioni che esistono già.**

---

## Come funziona

```
┌──────────────┐     sync        ┌─────────────┐
│  .gsd/*.md   │ ──────────►     │             │
│  codice src  │   post-commit   │  Qdrant     │
│  (tutti i    │                 │  gsd_memory │
│   progetti)  │ ◄────────────   │  collection │
└──────────────┘   auto-retrieve └─────────────┘
                          │
                          ▼
              Risultati con relevance_score
              (0.92 — 0.99 per match forti)
```

1. **Sync automatico** — dopo ogni commit locale, `.gsd/` e il codice vengono indicizzati in `gsd_memory`, una collection condivisa tra tutti i progetti
2. **Codice analizzato in profondità** — estrazione di signatures, JSDoc, commenti, GSD IDs, link bidirezionali con la documentazione
3. **Ricerca boostata** — vector cosine + lexical TF-lite + boosting per contenuti riutilizzabili e cross-project
4. **Auto-retrieve hook** — inietta contesto rilevante prima di ogni risposta, senza che l'agent debba ricordarsi di cercarlo

## Auto-retrieve: il contesto arriva da solo

**Nessun altro tool inietta automaticamente contesto cross-project nel flusso dell'agent.**

L'hook intercetta ogni richiesta utente, chiama `auto_retrieve()` nel server MCP, filtra per soglia di rilevanza e inietta il contesto nel payload. L'agent vede solo il risultato — zero overhead.

### Risparmio tokens

| Cosa                   | Senza hook                             | Con hook                                    |
| ---------------------- | -------------------------------------- | ------------------------------------------- |
| **Chi chiama il tool** | L'agent (via KNOWLEDGE.md)             | L'hook (trasparente)                        |
| **Tokens nel prompt**  | Input tool call + output risultati     | Solo la richiesta dell'utente               |
| **Reasoning**          | L'agent ragiona al buio su cosa esiste | L'agent vede subito il contesto disponibile |
| **Fiducia**            | A volte ricorda di cercare, a volte no | Contesto sempre consistente                 |

Un'agent senza contesto cross-project tende a riscrivere pattern che esistono già. Ogni riga di codice riscritta da zero è un token sprecato.

## Features

| Feature                        | Dettaglio                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚡ **Auto-retrieve hook**      | **★ Unique** — Iniezione automatica di contesto prima di ogni risposta. Zero query manuali, zero tokens sprecati a reinventare                                                           |
| 🌐 **Cross-project retrieval** | Collection unificata `gsd_memory` con embedding bge-m3-1024 multilingue — tutti i progetti condividono la stessa knowledge base                                                              |
| 🔍 **Flat search + re-ranking**| Flat search(LIMIT=30) → lexical rescue pre-threshold → threshold filter(≥0.78 CLI / ≥0.70 MCP) → recency/path matching → token truncation; più candidati per il re-ranker, soglie abbassate |
| 📊 **Re-ranking avanzato**     | Recency boost +0.05 (file <30gg), path matching +0.15, symbol boost ×1.5, source path overlap fino a +0.20 — flat search LIMIT=30 con soglie 0.78/0.55 CLI e 0.70/0.48 MCP |
| 🔗 **Doc↔Code linking**        | **★ Unique** — ogni snippet ha `relatedDocPaths` e `relatedDocIds`: il codice sa quali docs gli appartengono, e i docs sanno quali code file citano. Retrieval contestuale bidirezionale |
| 💻 **Smart code indexing**     | bge-m3-1024 con path-first (prima linea = percorso file) e weighted header SIGNATURES:/EXPORTS:/IMPORTS: — il codice è indicizzato come lo leggono gli agent                                                        |
| 🔄 **Auto-sync**               | Hook `post-commit` sincronizza automaticamente. Health check su Qdrant prima di ogni sync. Zero configurazione manuale                                                                   |
| ⚡ **Zero config**             | Un comando: `gsd-qdrant-knowledge`. Bootstrap, collection, MCP registration, hook — tutto automatico                                                                                     |

## Scoring (bge-m3 + flat search + re-ranking)

| Range           | Significato                                                        |
| --------------- | ------------------------------------------------------------------ |
| **0.95 – 1.0**  | Match eccellente — vettoriale forte + recency/path/symbol boost      |
| **0.85 – 0.94** | Match forte — buon embedding, boosting applicato                   |
| **0.78 – 0.94** | Rilevante CLI / ≥0.70 MCP — contesto utile (soglia primaria `SCORE_THRESHOLD`) |
| **0.55 – 0.77** | Fallback CLI / ≥0.48 MCP — risultati deboli ma potenzialmente utili                |
| **< 0.48**      | Ignorato (sotto entrambe le soglie fallback)               |

Il re-ranking applica:
- **+0.05 recency boost** per file modificati negli ultimi 30 giorni
- **+0.15 path matching** quando parole della query corrispondono al percorso sorgente
- **Symbol boost ×1.5** (≈+0.2) su match con `symbolNames` nel payload
- **Source path overlap fino a +0.20** — il basename del file (`ProjectCard.jsx`) viene tokenizzato e confrontato con i token della query

Soglie: flat search restituisce fino a LIMIT=30 candidati, filtra per SCORE_THRESHOLD (CLI 0.78 / MCP 0.70), fallback a FALLBACK_THRESHOLD (CLI 0.55 / MCP 0.48) se troppo pochi risultati. Il re-ranking fa il lavoro di filtraggio finale.

## Pipeline di retrieval (dettaglio)

```
flat search(LIMIT=30, bge-m3-1024)
    → lexical rescue pre-threshold (+symbol match ×1.5, +source overlap fino a 0.12)
    → threshold filter(≥0.78 CLI / ≥0.70 MCP)
    → fallback se <2 risultati (≥0.55 CLI / ≥0.48 MCP)
    → sortChunksByPosition() (ordinamento per startLine)
    → sibling file expansion (.css ↔ .jsx stesso stem)
    → re-ranking(recency + path match + symbol boost ×1.5 + source overlap fino a 0.20)
    → token estimation/truncation(4000 max, 500 char per risultato)
```

Il **lexical rescue pre-threshold** è il passo chiave che permette ai file con nomi significativi (`ProjectCard.jsx`, `AuthMiddleware.ts`) di sopravvivere al cutoff anche quando l'embedding semantico da solo non basta. Senza questo step, un punteggio vettoriale borderline (es. 0.41) veniva eliminato prima che il re-ranking potesse applicare i boost lessicali.

## Esempio di output

```
=== CONTESTO DA MEMORIA CROSS-PROJECT ===
Task: "implementare autenticazione JWT"
Trovati 3 risultati rilevanti:

• [doc] Authentication middleware pattern
  Score: 0.967 | Source: auth-middleware/DECISIONS.md
  Match type: semantic

• [code] JWT auth module with refresh tokens
  Score: 0.942 | Source: payment-service/src/auth/jwt.js
  Match type: semantic
  relatedDocPaths: [auth-middleware/DECISIONS.md]

• [doc] Security decisions and patterns
  Score: 0.918 | Source: api-gateway/DECISIONS.md
  Match type: semantic
```

## Architettura (v2.3.2 — zero file copying)

```
Sistema (installato una volta via npm):
├── gsd-qdrant-knowledge  (CLI — bin entry)
└── gsd-qdrant-mcp        (MCP server — bin entry, accetta --project)

Progetto (config minimi, zero JS):
├── .mcp.json             (configurazione MCP)
├── .git/hooks/post-commit (hook auto-sync)
└── .gsd/
    ├── KNOWLEDGE.md       (istruzioni agent)
    └── .qdrant-sync-state.json (stato sync)

gsd_memory (single Qdrant collection, bge-m3-1024 vectors)
├── type: doc          → .gsd/*.md (STATE.md escluso)
└── type: code         → src/**/*.js,ts,py,go,...
    ├── signatures, comments, exports, imports
    └── relatedDocPaths → docs collegati (GSD IDs matching)
```

**Prima (v2.3.1):** il tool copiava file JS dentro `gsd-qdrant-knowledge/` nel progetto → tokens sprecati, duplicazione.
**Ora (v2.3.2):** installazione una volta sola, setup crea solo config. Zero file JS nel progetto.

**Link bidirezionale docs ↔ code:** durante l'indicizzazione, il tool estrae i GSD IDs (M001, S02, T03…) da ogni file. Se uno snippet di codice cita `M003/S01/` e un doc contiene gli stessi IDs, il link viene creato automaticamente.

**Sibling expansion:** quando una query trova `ProjectCard.jsx`, il sistema cerca anche `ProjectCard.css`, `ProjectCard.test.js` nello stesso path — lo stem del file funziona da chiave per recuperare tutti i file correlati senza bisogno che la query li menzioni esplicitamente.

- **GSD = source of truth** — i file `.gsd/` del progetto corrente restano gestiti localmente
- **Qdrant = enhancer** — memoria condivisa tra progetti, non sostituzione del contesto locale
- **Nessuna scrittura dentro `.gsd/`** — il tool rispetta i flussi nativi di GSD

## CLI

```bash
gsd-qdrant-knowledge setup                  # Setup progetto (config minimi + sync)
gsd-qdrant-knowledge migrate                # Migra da v2.3.1 (rimuove vecchia cartella)
gsd-qdrant-knowledge sync                   # Sincronizzazione manuale
gsd-qdrant-knowledge context "query"        # Query semantica manuale
gsd-qdrant-knowledge uninstall              # Rimuove gli artifact
```

Installazione completa: **[SETUP.md](SETUP.md)**

## Integrazione

Il tool espone un **MCP server** (`gsd-qdrant-mcp`) con lo strumento `auto_retrieve`. Attualmente integrato con **GSD/pi** tramite hook `before_provider_request`, l'architettura è agnostica e può essere adattata ad altri agent.

Durante il bootstrap, il progetto registra automaticamente il server in `.mcp.json` — nessuna configurazione manuale richiesta.

---

**Link utili:** [Setup completo](SETUP.md) · [Changelog](CHANGELOG.md)
