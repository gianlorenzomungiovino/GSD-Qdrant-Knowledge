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
2. **Indicizzazione single-point-per-file** — ogni file piccolo (≤32K char) produce un singolo punto Qdrant con full content embedded + metadata arricchiti; i file grandi (>32K) usano chunking a 8000 char con contesto completo del file
3. **Metadata arricchiti nell'embedding text** — signatures, exports, imports, symbolNames, comments e GSD IDs sono pre-pended al contenuto come header strutturato per positional weighting (bge-m3 dà più peso alle prime token)
4. **Auto-retrieve hook** — inietta contesto rilevante prima di ogni risposta, senza che l'agent debba ricordarsi di cercarlo

### Strategia di indicizzazione

| Tipo file | Dimensione | Punti Qdrant | Embedding text | Payload content |
|-----------|------------|--------------|----------------|-----------------|
| **Doc** (.md) | Qualsiasi | 1 per file | full content + metadata header | full content |
| **Code piccolo** (≤32K char) | ≤32.000 | 1 per file | metadata header + full content | full content |
| **Code grande** (>32K char) | >32.000 | N chunk ×8000 | metadata header + chunk slice | chunk slice (full file in context) |

Per i file code piccoli, l'embedding text segue questa struttura:

```
project:{nome_progetto}
path:{percorso_relativo}
language:{linguaggio}
kind:{scope}
exports:{export1, export2, ...}
imports:{import1, import2, ...}
symbols:{symbolNames, ...}
comments:{commenti_troncati_1_riga}

{full_content_del_file}
```

I metadata sono pre-pended prima del contenuto per sfruttare il **positional weighting** di bge-m3 — le prime token ricevono maggiore attenzione nell'encoder. Il totale è limitato a 32K caratteri; se superato, il body viene troncato con un marker `/* ... truncated */`.

Per i file grandi (>32K char), ogni chunk mantiene lo stesso header arricchito ma include anche `chunk:N/M` per la posizione nel file originale.

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
| 🔍 **Flat search + re-ranking**| Flat search(LIMIT=50) → threshold filter(≥0.85) → recency/path matching → token truncation; prefetch per candidati più ampi con soglie 0.85/0.75                     |
| 📊 **Re-ranking avanzato**     | Recency boost +0.05 (file <30gg), path matching +0.15, symbol boost ×1.5 — flat search LIMIT=50 con soglie 0.85/0.75                              |
| 🔗 **Doc↔Code linking**        | **★ Unique** — ogni punto ha `relatedDocPaths` e `relatedDocIds`: il codice sa quali docs gli appartengono, e i docs sanno quali code file citano. Retrieval contestuale bidirezionale |
| 📄 **Single-point-per-file**   | Ogni file piccolo (≤32K char) → 1 punto Qdrant con full content embedded + metadata arricchiti; fallback chunking a 8000 per file grandi (>32K)                                          |
| 💻 **Metadata enrichment**     | Signatures, exports, imports, symbolNames, comments pre-pended come header strutturato — positional weighting di bge-m3 dà priorità ai simboli del codice                                                        |
| 🔄 **Auto-sync**               | Hook `post-commit` sincronizza automaticamente. Health check su Qdrant prima di ogni sync. Zero configurazione manuale                                                                   |
| ⚡ **Zero config**             | Un comando: `gsd-qdrant-knowledge`. Bootstrap, collection, MCP registration, hook — tutto automatico                                                                                     |

## Scoring (bge-m3 + flat search + re-ranking)

| Range           | Significato                                                        |
| --------------- | ------------------------------------------------------------------ |
| **0.95 – 1.0**  | Match eccellente — vettoriale forte + recency/path boost            |
| **0.85 – 0.94** | Match forte — buon embedding, boosting applicato                   |
| **0.75 – 0.84** | Rilevante — contesto utile (soglia primaria `SCORE_THRESHOLD=0.85`)   |
| **< 0.75**      | Ignorato (soglia fallback `FALLBACK_THRESHOLD=0.75`)               |

Il re-ranking applica:
- **+0.05 recency boost** per file modificati negli ultimi 30 giorni
- **+0.15 path matching** quando parole della query corrispondono al percorso sorgente
- **Symbol boost ×1.5** (≈+0.2) su match esatto con `symbolNames` nel payload

Soglie: prefetch restituisce fino a PREFETCH_LIMIT=50 candidati, filtra per SCORE_THRESHOLD=0.85, fallback a FALLBACK_THRESHOLD=0.75 se meno di 2 risultati sopra soglia. Il re-ranking fa il lavoro di filtraggio finale.

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

## Architettura (bge-m3 + flat search)

```
gsd_memory (single Qdrant collection, bge-m3-1024 vectors)
├── type: doc          → .gsd/*.md (STATE.md escluso), 1 punto/file
│   └── payload: content=full file, title, section, tags
├── type: code         → src/**/*.js,ts,py,go,..., 1 punto/file piccolo
│   ├── metadata header: project, path, language, kind, exports, imports, symbols, comments
│   └── payload: content=full file, signatures, relatedDocPaths, gsdIds
├── type: large-file-chunk → code >32K char, N chunk×8000
│   ├── metadata header + chunk:N/M position
│   └── payload: fullFileContext (allSignatures, allComments, etc.)
```

**Link bidirezionale docs ↔ code:** durante l'indicizzazione, il tool estrae i GSD IDs (M001, S02, T03…) da ogni file. Se uno snippet di codice cita `M003/S01/` e un doc contiene gli stessi IDs, il link viene creato automaticamente.

**Payload Qdrant — struttura per tipo:**

| Campo | Doc | Code piccolo | Large-file chunk |
|-------|-----|--------------|------------------|
| `project_id` | ✓ | ✓ | ✓ |
| `type` | `"doc"` | `"code"` | `"large-file-chunk"` |
| `source` (relPath) | ✓ | ✓ | ✓ |
| `content` | full file | full file | chunk slice |
| `signatures` | — | ✓ (≤50) | ✓ (combined per-chunk + file-level) |
| `exports/imports` | — | ✓ | ✓ (file-level context) |
| `symbolNames` | — | ✓ | ✓ |
| `comments` | — | ✓ (truncated 1-line, ≤8) | ✓ (combined) |
| `relatedDocPaths` | — | ✓ | ✓ |
| `chunkIndex/totalChunks` | — | — | ✓ |

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
