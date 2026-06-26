# gsd-qdrant-knowledge

**Knowledge base semantica cross-project per AI coding agents.**

Un agent che reinventa la ruota ogni volta che cambia progetto? Non più. Questo tool indicizza automaticamente `.gsd/` e codice sorgente in una collection Qdrant unificata che supporta **TurboQuant**, poi fa retrieving di contesto rilevante da _altri progetti_ — con scoring intelligente che premia contenuti riutilizzabili e cross-project.

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

| Feature                         | Dettaglio                                                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚡ **Auto-retrieve hook**       | **★ Unique** — Iniezione automatica di contesto prima di ogni risposta. Zero query manuali, zero tokens sprecati a reinventare                                                                                                   |
| 🌐 **Cross-project retrieval**  | Collection unificata `gsd_memory` con embedding bge-m3-1024 multilingue — tutti i progetti condividono la stessa knowledge base                                                                                                  |
| 🔍 **Flat search + re-ranking** | Flat search(LIMIT=30) → lexical rescue pre-threshold → composite score filtering(≥0.70 / ≥0.48) → recency/path matching → token truncation; più candidati per il re-ranker, soglie unificate                                     |
| 📊 **Re-ranking avanzato**      | Recency boost +0.05 (file <30gg), path matching +0.15, symbol boost ×1.5, source path overlap fino a +0.20 — formula composita unificata `0.6×sim + 0.15×recency + 0.05×importance + boosts` su tutti e 3 gli entry point        |
| 🔗 **Doc↔Code linking**         | **★ Unique** — ogni snippet ha `relatedDocPaths` e `relatedDocIds`: il codice sa quali docs gli appartengono, e i docs sanno quali code file citano. Retrieval contestuale bidirezionale                                         |
| 💻 **Smart code indexing**      | bge-m3-1024 con path-first (prima linea = percorso file) e weighted header SIGNATURES:/EXPORTS:/IMPORTS: — il codice è indicizzato come lo leggono gli agent                                                                     |
| 🔄 **Auto-sync**                | Hook `post-commit` sincronizza automaticamente. Health check su Qdrant prima di ogni sync. Zero configurazione manuale                                                                                                           |
| ⚡ **Zero config**              | Un comando: `gsd-qdrant-knowledge`. Bootstrap, collection, MCP registration, hook — tutto automatico                                                                                                                             |
| 🗜️ **TurboQuant 4-bit**         | Qdrant 1.18+ con compressione vettoriale TurboQuant: **~8x meno spazio** vs F32 (doppia della scalar quantization), **recall 95,6%** (misurato su 39.853 punti), **ricerca più veloce** (vettori più piccoli = più dati in CPU cache). Abilitato di default |

## Scoring (bge-m3 + flat search + re-ranking)

| Range           | Significato                                                     |
| --------------- | --------------------------------------------------------------- |
| **0.95 – 1.0**  | Match eccellente — vettoriale forte + recency/path/symbol boost |
| **0.85 – 0.94** | Match forte — buon embedding, boosting applicato                |
| **0.70 – 0.84** | Rilevante — contesto utile (soglia primaria unificata)          |
| **0.48 – 0.69** | Fallback — risultati deboli ma potenzialmente utili             |
| **< 0.48**      | Ignorato (sotto soglia fallback)                                |

Formula composita unificata (tutti e 3 gli entry point):

```
score = 0.6 × similarity + 0.15 × recency + 0.05 × importance + boosts
clamped [0, 1]
```

Il re-ranking applica:

- **+0.05 recency boost** per file modificati negli ultimi 30 giorni
- **+0.15 path matching** quando parole della query corrispondono al percorso sorgente
- **Symbol boost ×1.5** (≈+0.2) su match con `symbolNames` nel payload
- **Source path overlap fino a +0.20** — il basename del file (`ProjectCard.jsx`) viene tokenizzato e confrontato con i token della query
- **crossProjectBoost +0.06** per risultati da altri progetti

Soglie unificate: flat search restituisce fino a LIMIT=30 candidati (CLI) / LIMIT=15 (MCP), filtra per SCORE_THRESHOLD **0.70** (primario) / FALLBACK_THRESHOLD **0.48** (fallback). Il re-ranking fa il lavoro di filtraggio finale.

## Pipeline di retrieval (dettaglio)

```
flat search(LIMIT=30 CLI / 15 MCP, bge-m3-1024)
    → lexical rescue pre-threshold (+symbol match ×1.5, +source overlap fino a 0.12)
    → composite score filtering(≥0.70 primario / ≥0.48 fallback)
    → sortChunksByPosition() (ordinamento per startLine)
    → sibling file expansion (.css ↔ .jsx stesso stem)
    → re-ranking(composite: recency + path match + symbol boost ×1.5 + source overlap + crossProjectBoost)
    → token estimation/truncation(8000 max, 800 char per risultato)
```

Il **lexical rescue pre-threshold** è il passo chiave che permette ai file con nomi significativi (`ProjectCard.jsx`, `AuthMiddleware.ts`) di sopravvivere al cutoff anche quando l'embedding semantico da solo non basta. Senza questo step, un punteggio vettoriale borderline (es. 0.41) veniva eliminato prima che il re-ranking potesse applicare i boost lessicali.

**CLI context output**: Oltre al retrieval standard, il comando `context` produce una tabella markdown strutturata con pattern tecnologici rilevati, concetti correlati espansi semanticamente (two-phase search) e documentazione correlata.

## Esempio di output CLI

```
**Pattern rilevati:** React, TypeScript

| File | Descrizione | Progetto | Tecnica |
|------|-----------|----------|---------|
| [src/auth/jwt.js](#src_auth_jwt_js) | JwtModule | payment-service | code/javascript |
| [lib/auth.ts](#lib_auth_ts) | type AuthConfig | api-gateway | code/typescript |

## Elementi correlati

1. **authMiddleware** — export function authMiddleware(req, res, next)
   - Source: start/src/backend/utils/authMiddleware.js

2. **useAuth** — const useAuth = () =>
   - Source: start/src/contesti/useAuth.js
```

## CLI

```bash
gsd-qdrant-knowledge setup                  # Setup progetto (config minimi + sync)
gsd-qdrant-knowledge migrate                # Migra da v2.3.1 (rimuove vecchia cartella)
gsd-qdrant-knowledge sync                   # Sincronizzazione manuale
gsd-qdrant-knowledge context "query"        # Query semantica manuale
gsd-qdrant-knowledge uninstall              # Rimuove gli artifact
```

Installazione e configurazione: **[SETUP.md](SETUP.md)**

## Integrazione

Il tool espone un **MCP server** (`gsd-qdrant-mcp`) con lo strumento `auto_retrieve`. È già testato e funzionante con **GSD/pi** e **Claude Code**, quindi compatibile con tutti gli agenti che seguono lo stesso pattern MCP (Stdio + `.mcp.json`).

Durante il setup, il progetto registra automaticamente il server in `.mcp.json` — nessuna configurazione manuale richiesta.

---

**Link utili:** [Setup completo](SETUP.md) · [Changelog](CHANGELOG.md)
