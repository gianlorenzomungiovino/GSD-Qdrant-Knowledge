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
| 🌐 **Cross-project retrieval** | Collection unificata `gsd_memory` — tutti i progetti condividono la stessa knowledge base                                                                                                |
| 🔍 **Hybrid matching**         | Vector cosine (semantico) + lexical TF-lite (nomi, pattern) — i risultati più pertinenti arrivano primi                                                                                  |
| 📊 **Scoring intelligente**    | Boost per contenuti `reusable` (+0.08), cross-project (+0.12), importanza e recency — i match forti superano 0.95                                                                        |
| 🔗 **Doc↔Code linking**        | **★ Unique** — ogni snippet ha `relatedDocPaths` e `relatedDocIds`: il codice sa quali docs gli appartengono, e i docs sanno quali code file citano. Retrieval contestuale bidirezionale |
| 💻 **Smart code indexing**     | Estrae signatures, JSDoc, comments, exports, imports, GSD IDs, language scope — il codice è indicizzato come lo leggono gli agent                                                        |
| 🔄 **Auto-sync**               | Hook `post-commit` sincronizza automaticamente. Health check su Qdrant prima di ogni sync. Zero configurazione manuale                                                                   |
| ⚡ **Zero config**             | Un comando: `gsd-qdrant-knowledge`. Bootstrap, collection, MCP registration, hook — tutto automatico                                                                                     |

## Scoring

| Range           | Significato                                                        |
| --------------- | ------------------------------------------------------------------ |
| **0.95 – 0.99** | Match eccellente — vettoriale forte + boost cross-project/reusable |
| **0.90 – 0.94** | Match forte — buon embedding + boosting applicato                  |
| **0.80 – 0.89** | Match buono — rilevante ma boosting limitato                       |
| **0.70 – 0.79** | Rilevante — contesto utile ma non ottimale                         |
| **< 0.70**      | Debole — verificare la query                                       |

Il boosting premia contenuti riutilizzabili, cross-project, e documenti ad alta importanza (`STATE.md`, `REQUIREMENTS.md`, `DECISIONS.md`).

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

## Architettura

```
gsd_memory (single Qdrant collection)
├── type: doc          → .gsd/*.md (STATE.md escluso)
└── type: code         → src/**/*.js,ts,py,go,...
    ├── signatures, comments, exports, imports
    └── relatedDocPaths → docs collegati (GSD IDs matching)
```

**Link bidirezionale docs ↔ code:** durante l'indicizzazione, il tool estrae i GSD IDs (M001, S02, T03…) da ogni file. Se uno snippet di codice cita `M003/S01/` e un doc contiene gli stessi IDs, il link viene creato automaticamente.

- **GSD = source of truth** — i file `.gsd/` del progetto corrente restano gestiti localmente
- **Qdrant = enhancer** — memoria condivisa tra progetti, non sostituzione del contesto locale
- **Nessuna scrittura dentro `.gsd/`** — il tool rispetta i flussi nativi di GSD

## CLI

```bash
gsd-qdrant-knowledge                        # Bootstrap completo
gsd-qdrant-knowledge context "query"        # Query manuale
gsd-qdrant-knowledge uninstall              # Rimuove gli artifact
```

Installazione completa: **[GSD-QDRANT-SETUP.md](GSD-QDRANT-SETUP.md)**

## Integrazione

Il tool espone un **MCP server** (`gsd-qdrant-mcp`) con lo strumento `auto_retrieve`. Attualmente integrato con **GSD/pi** tramite hook `before_provider_request`, l'architettura è agnostica e può essere adattata ad altri agent.

Durante il bootstrap, il progetto registra automaticamente il server in `.mcp.json` — nessuna configurazione manuale richiesta.

---

**Link utili:** [Setup completo](GSD-QDRANT-SETUP.md) · [Changelog](CHANGELOG.md)
