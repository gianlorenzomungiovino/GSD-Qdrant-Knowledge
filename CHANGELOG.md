# Changelog

## 2.3.8

### Added — Always-on whitelist docs as project context layer (Opzione 4: Sezioni Separate)

- **Le docs del whitelist (ROADMAP, CONTEXT, ASSESSMENT, UAT, ecc.) vengono restituite con OGNI query**, non solo per query GSD-specifiche.
- **Risultati separati in 2 sezioni**: `Code Results (query-specific)` e `Project Context` — l'LLM vede chiaramente la differenza tra "risultati della query" e "contesto del progetto".
- **Max 2 docs come `project context`** (`_projectContext`) — limitate per non sovraccaricare l'LLM.
- **Max 3 code results** — il codice specifico per la query ha priorità.
- **Scenario reale**: query "typewriter animation" → 3 code results (Hero.jsx, LineWaves.jsx, Drawer.jsx) + 2 docs (M001-CONTEXT, ASSESSMENT) → l'LLM usa il codice per implementare, le docs per capire dove inserirlo.
- **Implementazione**: dopo la primary search, si cerca sempre le docs del whitelist con la stessa query. Le prime 2 (score ≥ 0.40) vengono aggiunte con boost di importance a 3. Le due sezioni vengono formattate separatamente.

### Fixed — Composite scoring per project context docs

- **Le docs `_projectContext` bypassano la formula composite score**: prima il composite score (`0.6×similarity + 0.15×recency + 0.05×importance`) schiacciava le docs sotto la soglia perché avevano `importance=2` e `recency=0`.
- **Ora le docs `_projectContext` ricevono `importance=3` e `finalScore = max(composite, baseBoost × 0.85)`** — garantiscono che sopravvivano al filtering.
- **Token budget separato**: code results usano `maxTokens: 4000`, project context docs usano `maxTokens: 2000` — le docs sono più corte e non sprecano token.

### Fixed — Limit applicato correttamente ai risultati (separati per sezione)

- **Prima il `limit` veniva calcolato (`final = deduped.slice(0, limit)`) ma MAI usato** — `formatResultsForOutput` riceveva `ranked` (tutti i risultati, anche 27+).
- **Ora i limiti sono separati per sezione**: max 3 code results + max 2 project context docs = max 5 total.
- **Ogni sezione viene formattata e troncata independently** — le docs non competono con il codice per i slot.

### Fixed — `.gsd/` escluso dall'indicizzazione come codice

- **`.gsd` aggiunto a `EXCLUDED_DIRS`** in `gsd-qdrant-template.js`.
- **Nessun file dentro `.gsd/` viene più indicizzato come code** — solo le .md del whitelist restano indicizzate come docs.
- **Prima**: file come `.gsd/STATE.md`, `.gsd/PROJECT.md` venivano scansionati come codice e indicizzati con chunking → rumore nei risultati.

### Added — Logging per indicizzazione dei file docs

- **Ogni doc indicizzata stampa `[sync] doc N/M: path`** — allineato al logging esistente per i code files (`[sync] file N/M: path`).
- **I file non cambiati mostrano `[sync] doc skip (unchanged): path`** — visibile quando il sync rileva hash invariato.
- **Prima**: il log mostrava solo `Found 57 documentation files to index` senza dettagli → confusione su cosa veniva indicizzato realmente.

---

## 2.3.7

### Added — Non-blocking post-commit hooks

- **Sync eseguito in background su tutti e 3 i platform**: I hook post-commit (.bat, .ps1, .sh) ora lanciano il sync in background (`start /b`, `Start-Process -WindowStyle Hidden`, `nohup & disown`) invece di bloccare il commit in attesa della risposta.
- **Endpoint health verificato**: Il controllo di raggiungibilità Qdrant usa `/health` invece del root `/`, con timeout aumentato a 2s.
- **Nessun filtro di commit**: Gli hook ora sincronizzano ad ogni commit locale, senza controllare se ci sono file `.gsd/` modificati.

### Fixed — Universal GSD file detection in walkGsd

- **Regex stripa TUTTI i prefissi consecutivi**: `/^([A-Z]*\d+[-_])+/gi` — prima `/^[A-Z]+\d+[-_]/i` stripava solo il primo prefisso, rompendosi con la nuova struttura `phases/01-01-ASSESSMENT.md`.
- **Logica whitelist-only**: Rimosso il controllo `GSD_PROJECT_FILES` blacklist da `walkGsd` (era un falso positivo che escludeva `CODEBASE.md` dalla whitelist). La blacklist rimane in `walkProjectCode` per l'indicizzazione del codice sorgente.
- **Struttura directory agnostica**: `walkGsd` ora funziona uniformemente con `milestones/M001/`, `phases/01-xxx/`, o layout flat — dipende solo dal nome base del file, non dal percorso.
- **Risultati**: espresso_scraping (milestones) → 3 file, Moro Design Store (phases) → 67 file.

### Fixed — Language filter disambiguation (C/C++/C#)

- **Pattern C/C++/C# separati correttamente**: Prima `/b(c|\.c)\b/` e `/b(c\+\+|cpp|\.cpp)\b/` potevano matchare ambigui. Ora:
  - `'c': /\bc(?!\+|#)|\.c\b/` — C puro, non C++ o C#
  - `'cpp': /(?<!\w)(c\+\+|cpp|\.cpp|\.cc)(?!\+)/` — C++ con word boundary
  - `'c#': /c#|c\#|\.cs(?![a-zA-Z_])/` — C# con lookahead negativo
- **Pattern duplicati rimossi**: `'esecuzione'` duplicato in `script`, `'librerias'` in `utility`, `'configuratione'` in `config`.
- **Termini di filtro puliti da `extractSearchTerms()`**: `c`, `c#`, `configuration`, `librerias`, `aiuto` duplicato rimossi dalla lista di rimozione.

---

## 2.3.6

### Fixed — Knowledge instructions positioned after GSD intro paragraph

- **`insertAfterIntro()` in `knowledge-instructions.js`**: le istruzioni auto-retrieve per l'agente GSD vengono inserite **subito dopo l'intro fissa** del template KNOWLEDGE.md (`"Agents read this before every unit..."`), invece di essere *appese in fondo* al file. La funzione usa un anchor testuale fisso invece di cercare heading `##`, evitando di spezzare blocchi custom di altri tool (GitNexus ha i propri `## Always Do`, `## Never Do`, ecc.). Fallback su "prima del primo `##`" per file non generati da GSD.

### Fixed — Precise HTML-comment delimiters for Qdrant section

- **Marker HTML `<!-- gsd-qdrant-knowledge:start -->` / `end -->`**: la sezione Qdrant è ora delimitata da comment HTML espliciti invece che da heading `##` e ricerca del prossimo `##`. Questo rende **installazione, aggiornamento e rimozione** (uninstall) precisi al 100% — nessun altro contenuto del file viene toccato, anche se contiene heading `##` personalizzati da altri tool.
- **`replaceQdrantBlock()` sostituisce `replaceBetweenMarkers()`**: la vecchia funzione cercava il prossimo `##` dopo il marker, rischiando di cancellare contenuto di altri tool. La nuova cerca solo `MARKER_END`.
- **`extractVersion()` limitato al blocco Qdrant**: la versione viene letta solo dal blocco tra i marker HTML, non dall'intero file.
- **Funzione rinominata**: `insertBeforeFirstHeading()` → `insertAfterIntro()` per riflettere il comportamento reale.

---

## 2.3.5

### Fixed — Dead code cleanup

- **Rimosso `findRelatedDocs()` da `related-concepts.js`** (~80 righe): funzione completamente morta, mai chiamata. La CLI usa la versione di `related-docs.js`.
- **Rimosse esportazioni orfane**: `extractKeywords`, `deriveDescription` da `related-concepts.js` (solo uso interno); `PATTERN_DB`, `detectPatterns` da `pattern-detection.js` (solo uso interno).
- **`related-concepts.js` ridotta da 14.7kB a 11.6kB** (-21%).

### Added — CODEBASE.md embedding in Qdrant whitelist

- **CODEBASE.md, VISION.md, CHANGELOG.md aggiunti alla whitelist di embedding**: Questi file ora vengono indicizzati in Qdrant insieme ai file sorgente del progetto, fornendo all'agente contesto sul progetto (visione, struttura, storia delle modifiche) durante la ricerca semantica.
- **OVERRIDES.md esplicitamente escluso**: Il file di override non viene più incluso nella whitelist, evitando rumore nei risultati di ricerca.
- Basato sull'analisi di 781 file .md del repo gsd-pi per determinare i file più rilevanti per l'embedding.

### Added — CLI path matching activation

- **`applyRecencyBoost()` ora riceve `rawQuery` in `cli.js`**: Il percorso del file sorgente viene confrontato con i token della query originale, attivando il path matching nel re-ranking anche dal CLI interattivo.
- **`calculateLexicalSignal()` esportato da `re-ranking.js`**: Reso disponibile per prevenire il crash del server MCP quando il segnale lessicale era richiesto ma non esportato.

### Added — KNOWLEDGE.md Query Tips examples

- **Sezione Example con 4 esempi concreti**: Il template `auto_retrieve` in KNOWLEDGE.md ora include una tabella con esempi di trasformazione domanda → keywords, per aiutare l'agente a formulare query più efficaci.

### Added — Unified composite scoring

- **Formula composita centralizzata in `calculateCompositeScore()`** (`src/re-ranking.js`): `0.6×similarity + 0.15×recency + 0.05×importance + boosts`, clamped [0,1]. Tutti e 3 gli entry point (CLI, MCP, Template) unificati sulla stessa funzione.
- **Threshold unificati**: CLI e MCP usano ora `0.70` (primario) / `0.48` (fallback) invece di soglie raw diverse (CLI 0.78/0.55, MCP 0.70/0.48, Template 0.60 raw).
- **CLI filtering su composite score invece di raw cosine**: Prima, il CLI filtrava sul raw score Qdrant PRIMA dei boosts — un risultato con 0.75 raw veniva scartato anche se i boosts lo avrebbero portato a 0.90+. Ora il filtro avviene dopo il composite score.
- **crossProjectBoost ridotto da 0.12 a 0.06**: Ridotta la dominance di progetti grandi nei risultati MCP.
- **Chunking 1500/200 mantenuto**, token budget raddoppiato a **8000**, `maxCharsPerResult` aumentato a **800** (prima 500), MCP LIMIT ridotto a **15** (prima 30).
- **Template `searchWithContext` allineato**: Non usa più `score_threshold` raw di Qdrant — fetch dei candidati e scoring composito locale, come CLI e MCP.

### Added — CLI context tabella markdown + pattern detection

- **`formatResultsForTable()` in `re-ranking.js`**: Il comando `CLI context` ora produce una tabella markdown strutturata con colonne **File | Descrizione | Progetto | Tecnica** invece di JSON grezzo.
- **`pattern-detection.js` con `PATTERN_DB` centralizzato**: 10+ pattern tecnologici rilevati via regex (zero-LLM). `getTopPatterns()` aggrega e normalizza i pattern su più risultati.
- **Header pattern in evidenza** nella tabella CLI.

### Added — CLI conceptual expansion

- **`related-concepts.js` con two-phase semantic search**: Risultati primari → estrazione keyword → ricerca secondaria Qdrant → filtraggio overlap. Espansione semantica dei concetti senza chiamate LLM esterne.
- **`related-docs.js` con GSD ID extraction**: Correlazione documentazione tramite estrazione di GSD IDs (M\d{3}, S\d{2}, T\d{2}, R\d{3}, D\d{3}) dai payload Qdrant.
- **`formatConceptsSection()`**: Sezioni markdown sotto la tabella CLI, con try/catch indipendente per resilienza.

### Removed — Dead code elimination

- **Eliminato `src/stopwords.js`**: File di stopwords eliminato e dati inlineati nei 3 consumatori (query-cache.js, intent-detector.js, re-ranking.js).
- **Eliminato `src/auto-retrieve-mcp.js`**: File orfano senza referenze nel codice sorgente.
- **Eliminato `src/install-gsd-extension.js`**: File orfano senza referenze nel codice sorgente.
- **Eliminato `src/gsd-qdrant-mcp/README.md`**: File ridondante.

### Removed — Stopwords filtering removed from token extraction

- **`filterStopwords` rimosso da `extractTokens()` e `extractKeywords()`**: Solo il filtro per lunghezza del token (≥2 caratteri) è mantenuto.
- **`filterStopwords` rimosso da `normalizeQuery()`**: La funzione ora fa solo lowercase → trim → split → filtro token vuoti → join.

### Removed — Unused exports cleaned up

- **13 exports rimosse totali**: 5 da re-ranking.js, 6 da intent-detector.js, 2 da knowledge-instructions.js — tutte verificate come non usate esternamente.

### Changed — Simplified normalizeQuery()

- **`normalizeQuery()` semplificato in query-cache.js**: Rimossa costante STOPWORDS e funzione filterStopwords.

### Changed — COLLECTION_NAME ora configurabile via env var

- **`gsd-qdrant-template.js` legge `COLLECTION_NAME` da `process.env`**: Prima hardcoded a `'gsd_memory'`, ora rispetta la variabile d'ambiente con fallback.

### Fixed — package.json files array cleaned

- **Rimossi riferimenti a file eliminati**: stopwords.js, auto-retrieve-mcp.js, GSD-QDRANT-SETUP.md, src/gsd-qdrant-mcp/README.md.

---

## 2.3.4

### Fixed — Full re-index when collection already exists and is populated

- **Ripristinato l'indicizzazione completa su collection esistenti**: Quando la collection `gsd_memory` era già creata e popolata (es. da un progetto precedente), il sync non indicizzava più i file del nuovo progetto perché il controllo di esistenza della collection falliva il percorso corretto. Ora il flusso `init()` verifica correttamente se la collection esiste e prosegue con l'indicizzazione, anche se la collection è già presente nel server Qdrant.

### Removed — Obsolete test files

- **Eliminati file di test non più utilizzati**: Rimossi file di test obsoleti e duplicati che non facevano più parte del flusso di sviluppo.

### Changed — Model download moved to `npm install`

- **Download modello `bge-m3` anticipato a `npm install`**: Il modello embedding (1.1 GB) viene ora scaricato automaticamente durante l'installazione del pacchetto (`"install": "node src/install-model.js"`), invece di essere scaricato on-demand al primo `setup`. Il comando `setup` parte quindi immediatamente senza attesa di download.
- **Script di install non-bloccante**: Se il download fallisce (es. rete lenta), l'installazione del pacchetto non viene interrotta — il comando `setup` scaricherà il modello on-demand come fallback.
- **Configurazione da `.env`**: Lo script usa `EMBEDDING_MODEL` dalle variabili ambiente (default `Xenova/bge-m3`), allineato alla configurazione esistente.

## 2.3.3

### Added — TurboQuant Compression (Qdrant 1.18+)

- **Quantizzazione TurboQuant abilitata di default**: La collection `gsd_memory` ora usa TurboQuant 4-bit (TQ4) per compressione vettoriale.
- **~8x compression** vs F32 (doppia della scalar quantization), **recall ~0.92** (quasi invariata), **ricerca più veloce** (vettori più piccoli = più dati in CPU cache).
- **Funziona con qualsiasi embedding model**: TurboQuant applica una rotazione Hadamard che normalizza la distribuzione dei vettori — non serve più una distribuzione centrata come per la binary quantization.
- **Configurabile via env vars**:
  - `QDRANT_QUANTIZATION=turbo` (default) / `none` (disabilita)
  - `QDRANT_TURBO_BITS=bits4` (default, 8x) / `bits2` (16x) / `bits1_5` (24x) / `bits1` (32x)
  - `QDRANT_TURBO_ALWAYS_RAM=true` (default, keep quantized vectors in RAM)
- **Upgrade automatico**: Se una collection esistente non ha quantizzazione, il tool la ricrea con TurboQuant al prossimo sync (triggera full re-index).
- **Aggiornata documentazione SETUP.md** con nuove variabili ambiente e spiegazione TurboQuant.

### Fixed — MCP server path resolution for local/npm installs

- **Server MCP ora usa sempre `node` + percorso assoluto**: `getMcpServerCommand()` risolve il percorso con `require.resolve()` o percorsi relativi a `__dirname`, mai comandi bare nel PATH.
- **Funziona con installazione locale (npx/npm install)**: prima, il fallback usava `gsd-qdrant-mcp` come comando bare, che non esisteva quando il pacchetto era installato localmente — il server MCP non veniva trovato.
- **`-v` / `--version` funzionano in tutti i contesti**: `findFileInCliRoot()` ora cerca anche in `dirname(__dirname)` (root del pacchetto npm) e `process.cwd()`, risolvendo il crash `readFileSync(null)`.
- **Variabili TurboQuant allineate alla documentazione ufficiale Qdrant**: formato `quantization_config.turbo` con `bits` e `always_ram` (prima usava `quantization.type` con `product` + `compression` non supportati).

## 2.3.2

### Breaking — Nuova architettura di installazione (zero file copying)

- **Nessuna copia di file JavaScript nel progetto**: il tool non crea più la cartella `gsd-qdrant-knowledge/` dentro il progetto. I file runtime restano nell'installazione npm (globale o locale).
- **Setup minimale**: il comando `setup` crea SOLO tre artifact: `.mcp.json` (configurazione MCP), `.git/hooks/post-commit` (hook auto-sync), `.gsd/KNOWLEDGE.md` (istruzioni per l'agent).
- **Comandi dedicati**:
  - `gsd-qdrant-knowledge setup` — setup progetto con nuova architettura (crea config minimi, esegue sync iniziale)
  - `gsd-qdrant-knowledge migrate` — migra da v2.3.1: rimuove la vecchia cartella `gsd-qdrant-knowledge/`, pulisce `.gitignore`, suggerisce `setup`
  - `gsd-qdrant-knowledge sync` — sincronizza conoscenza (invariato)
  - `gsd-qdrant-knowledge context "<query>"` — ricerca semantica manuale (invariato)
  - `gsd-qdrant-knowledge uninstall` — rimuove artifact progetto (invariato)
- **MCP server con `--project`**: `gsd-qdrant-mcp` accetta `--project {path}` per conoscere la root del progetto. Legge configurazione da `.mcp.json` o variabili d'ambiente.
- **STATE_FILE spostato**: da `gsd-qdrant-knowledge/.qdrant-sync-state.json` a `.gsd/.qdrant-sync-state.json`.
- **Rimossi file non più usati**: `install-gsd-extension.js` (estensione GSD non più necessaria con la nuova architettura).

### Fixed

- **Token sprecati nel contesto progetto**: prima, i file JS del tool venivano copiati nel progetto e letti da GSD come parte del contesto. Ora zero file JS nel progetto → contesto pulito.
- **Duplicazione codice**: ogni progetto aveva la sua copia degli stessi file. Ora il tool è installato una volta sola (npm).

## 2.3.1

### Changed — Retrieval Threshold Calibration (bge-m3 mean pooling)

- **CLI thresholds**: `SCORE_THRESHOLD` a **0.78**, `FALLBACK_THRESHOLD` a **0.55**. Soglie più strette per il CLI che è usato in modo interattivo e beneficia di maggiore precisione.
- **MCP thresholds**: primary threshold a **0.70**, fallback a **0.48**. Leggermente più aperte del CLI perché l'agent può tollerare un po' più rumore e filtrare dopo con il re-ranking.

### Added — Chunk Positional Ordering (`sortChunksByPosition`)

- **Ordinamento chunks per posizione nel file sorgente**: I multi-chunk files ora vengono restituiti in ordine sequenziale corretto (linea crescente) invece che ordinati solo per score Qdrant, che poteva presentare codice invertito all'agente.
- Implementato come funzione runtime `sortChunksByPosition()` applicata **prima** del re-ranking e token trimming — zero modifiche allo schema Qdrant o al pipeline di chunking.
- Sfrutta i payload esistenti: `_parent_file` (raggruppamento), `startLine` (ordinamento primario), `chunkIndex` (tiebreaker). Preserva l'ordine score-based tra file diversi.
- Applicato in entrambi gli entry-point: `src/cli.js` e `src/gsd-qdrant-mcp/index.js`.

### Fixed — Lexical Rescue Pre-Threshold & Improved Tokenization

- **Lexical rescue pre-threshold nel server MCP**: prima della soglia di cutoff, i risultati con forte segnale lessicale (`symbolNames`, basename del file) ricevono un boost (+0.08 per symbol match ×1.5, +0.08–+0.12 per source path overlap). Questo evita che chunk come `ProjectCard.jsx` vengano eliminati dal threshold quando il punteggio semantico è borderline (es. 0.41 → 0.49 con rescue), permettendo al re-ranking finale di lavorarci sopra.
- **Token extraction migliorata**: `extractTokens()` ora split su CamelCase (`ProjectCard` → `project`, `card`), su `/`, `.`, `_`. Le query nominali corte come `"react card"` generano token semantici precisi invece di una stringa unica e troppo generica.
- **Source path boosting nel re-ranking**: nuova funzione `sourceToTokens()` + `calculateSourceTokenOverlapScore()`. Il basename del file (`ProjectCard.jsx`) viene tokenizzato e confrontato con i token della query: match parziale → +0.08/token, match completo su tutti i token → +0.20 flat.
- **`calculateLexicalSignal()`**: helper unificato che espone il segnale lessicale (symbol multiplier, source boost, matched counts) per uso sia nel pre-threshold rescue che nel re-ranking finale — single source of truth.

### Fixed — M006 Dead Branch Cleanup

- Rimossa directory `.gsd/milestones/M006/` (branch mai applicato).
- Puliti riferimenti a M006 da `.gsd/STATE.md` e `.gsd/PROJECT.md`.
- Eliminato file di test temporaneo `test-retrieval.js` dalla root del progetto.

## 2.3.0

### Changed — Embedding Model

- **bge-m3 sostituisce codebert-base**: Xenova/bge-m3 (1024 dim, multilingue 100+ lingue) è ora il modello embedding di default in tutti i file. Sostituisce `Xenova/codebert-base` che era specializzato solo per inglese e performava male su query non-English.
- **VECTOR_NAME** aggiornato da `codebert-768` a `bge-m3-1024` in index.js, cli.js (×2), gsd-qdrant-mcp/index.js, setup-from-templates.js, .mcp.json e template files.
- **EMBEDDING_DIMENSIONS** aggiornato da 768 a 1024.

### Changed — Search Architecture

- **Flat search + re-ranking sostituiscono searchPointGroups**: Flat search con LIMIT=30 (prima 5) dà al re-ranker più candidati da filtrare. Soglie abbassate: SCORE_THRESHOLD=0.7 (era 0.85), FALLBACK_THRESHOLD=0.55 (era 0.75).
- **Type hint → soft boost**: I type filter (config/example/template) ora vanno in `should` con mapping "type"→payload="code", non più in `must`. Risultati con tipo diverso possono apparire se semanticamente pertinenti.

### Added — Re-ranking Module (`src/re-ranking.js`)

- **Recency boost** +0.05 per file modificati negli ultimi 30 giorni (configurabile).
- **Path matching** +0.15 quando parole della query corrispondono al percorso sorgente del file.
- **Token estimation** (~4 chars/token) e **truncation** a ~4000 token totali, 500 char per risultato.

### Added — Query Cache (`src/query-cache.js`)

- Cache in memoria con TTL 5min, LRU eviction max 100 entry, sweep background ogni 60s.
- **normalizeQuery()**: lowercase + split + stopword filter (EN ~60 + IT ~75 termini).
- **applySymbolBoost()**: estrae token significativi e moltiplica score ×1.5 per match esatto su symbolNames.

### Added — Code Indexing Optimizations

- **Path-first embedding** in `buildCodeText` (index.js): percorso file grezzo come prima linea → massimo peso posizionale bge-m3.
- **Weighted header** in template: signatures/exports/imports pre-pendati con prefisso SIGNATURES:/EXPORTS:/IMPORTS:.

### Fixed — Tests

- `intent-detector.test.js`: 4 test aggiornati per nuova logica type hint → should soft boost (prima hard filter must).
- `query-cache.test.js`: cache key format aggiornato a `task|limit` (rimossa includeContent dal formato chiave).

## 2.2.2

### Fixed

- **Setup hanging dopo completamento (rimanente)**: Il fix di 2.2.1 applicava `process.exit(0)` solo a `setup-from-templates.js`, ma il CLI principale (`src/cli.js`) in `bootstrapProject()` non chiamava più `process.exit()` dopo `console.log('\n✅ Ready')`. Node.js manteneva il processo vivo perché il client Qdrant tiene connessioni TCP keep-alive aperte. Aggiunto `process.exit(0)` in `cli.js` e `.then(() => process.exit(0))` in `sync-knowledge.js`.

## 2.2.1

### Fixed

- **Uninstall cancellava tutti i punti della collection, non solo quelli del progetto corrente**: Il parametro `scroll_filter` passato a `/points/scroll` era ignorato da Qdrant (il parametro corretto è `filter`). Senza filtro server-side, lo scroll restituiva **tutti** i punti della collection e l'uninstall cancellava anche i dati di altri progetti. Sostituito `scroll_filter` con `filter` in tutti e tre i metodi: `deleteAllProjectPoints()`, `deleteMissingPoints()`, `deleteStaleProjectPoints()`.
- **Aggiunto cleanup Qdrant durante uninstall**: Il comando `gsd-qdrant-knowledge uninstall` ora cancella esplicitamente tutti i punti Qdrant del progetto prima di rimuovere gli artifact locali. In precedenza l'uninstall non toccava affatto la collection, lasciando dati orfani che potevano essere cancellati in modo errato dai successivi sync.
- **Setup hanging dopo completamento**: `setup-from-templates.js` non chiamava più `process.exit()` dopo il completamento asincrono, causando un terminale apparentemente bloccato. Aggiunto `.then(() => process.exit(0))` per uscita pulita.

## 2.2.0

### Added

- **QDrant health check before sync**: Bootstrap now runs `ensureQdrantRunning()` which hits `/healthz` before attempting sync. Provides clear error message with Docker command if QDrant is not available, and accepts `QDRANT_URL` environment variable override.
- **Environment propagation during sync**: `spawnSync` for the sync script now passes `env: { ...process.env }` instead of inheriting implicitly, ensuring `QDRANT_URL` and `COLLECTION_NAME` are available to the sync process.
- **Hybrid search documentation**: README.md and GSD-QDRANT-SETUP.md updated with Docker setup instructions, standalone QDrant installation, and hybrid search explanation (vector cosine + lexical TF-lite, weighted fusion).
- **QDrant v1.17.1 compatibility**: M002 roadmap updated for Qdrant client v1.17.1, with new S03 documentation slice.
- **Pre-publish checklist cleanup**: Removed step 11 (publish command) from checklist — publish is now a manual action the user runs separately.

### Changed

- **M002 roadmap restructured**: Hybrid search approach changed from C→A, with updated slice plans and new S03 documentation slice.

### Removed

- **Embedded QDrant experiment**: `src/embedded-qdrant.js` and `scripts/qdrant-cli.js` were created and then removed during the branch exploration. The final approach keeps Docker-based QDrant as the only deployment option.

## 2.1.9

### Fixed

- **Document embedding title missing**: `buildDocPayload` now includes a `title` field so that `buildDocText` can inject the document title into the embedding text. Previously only `.summary` existed but `.title` was expected, causing document titles to be omitted from vectors — weakening semantic search quality for docs.

### Removed

- **Dead code cleanup**: Removed orphaned and unused methods from `GSDKnowledgeSync`:non hffff
  - `findRelevantDocsForSnippet` (buggy: iterated `docIndex.allDocs` on an array, never called)
  - `buildSnippetText` (never called)
  - `indexFile` (never called, also referenced undefined `metadata`)
  - Duplicate `buildDocText` definition (was silently overwritten by the later one)
- **Orphaned file**: Removed `src/knowledge-sharing.js` — zero importers across the entire codebase.

## 2.1.8

### Fixed

- **KNOWLEDGE.md created during setup**: `setup-from-templates.js` now calls `ensureKnowledgeInstructions()` to create `.gsd/KNOWLEDGE.md` during setup. Previously this was only done in the CLI `bootstrapProject()`, so direct usage of `setup-from-templates.js` left KNOWLEDGE.md missing — breaking auto-retrieve.

## 2.1.7

### Fixed

- **Empty collection re-index**: When the Qdrant collection was deleted and recreated, the sync state file still had hashes from the previous indexing, causing "Updated 0" even though the collection was empty. Now checks if the collection has 0 points before syncing and resets the sync state to force a full re-index of all files.

## 2.1.5

### Changed

- **Writes to KNOWLEDGE.md instead of AGENTS.md**: The GSD (pi) CLI does not inject AGENTS.md into the system prompt — it only discovers it for `discover_configs`. KNOWLEDGE.md is actually injected. Bootstrap now writes the Qdrant auto-retrieve instructions to `.gsd/KNOWLEDGE.md` (project-level) with marker-based dedup, same as the previous AGENTS.md approach. Uninstall removes only the Qdrant section from KNOWLEDGE.md. AGENTS.md is no longer used.

## 2.1.4

### Changed

- **AGENTS.md path corrected**: Moved from `.gsd/agent/AGENTS.md` to project root `AGENTS.md`. The GSD (pi) CLI loads `AGENTS.md` from the project root (Codex convention at `<projectRoot>/AGENTS.md`), not from `.gsd/agent/`. Bootstrap now auto-migrates existing files from the old path to the new one. Uninstall cleans up both paths.

### Changed

- **Project-local instructions**: AGENTS.md moved from global `~/.gsd/agent/AGENTS.md` to project-local `<cwd>/.gsd/agent/AGENTS.md`, so instructions only load when GSD/pi runs inside the specific project that has Qdrant installed.
- **Uninstall cleanup**: CLI `uninstall` now removes Qdrant section from AGENTS.md (marker-based partial removal, preserving other content).
- **CLAUDE.md support disabled**: CLAUDE.md writing is commented and gated behind `// FUTURE` markers — will be activated when proper Claude Code detection is implemented.

## 2.1.2

### Fixed

- **Windows HOME env var missing**: Added `process.env.USERPROFILE` fallback when `HOME` is not set on Windows (which happens in some configurations). Without this, the GSD home directory path resolved as `.gsd` (relative) instead of `C:\Users\<user>\.gsd`, breaking AGENTS.md creation during bootstrap.

## 2.1.1

### Changed

- **Explicit auto_retrieve call rules**: Replaced passive "when to use" instructions in AGENTS.md with explicit "always call" rules for library/framework/component/technology questions, and a fallback rule when local search returns no relevant results.

## 2.1.0

### Added

- **Tarball integration test**: Pre-publish checklist includes sandbox installation, CLI version check, bootstrap verification, MCP server startup, `auto_retrieve` tool execution with cross-project results, and uninstall cleanup — all verified passing.

## 2.0.9

### Fixed

- **MCP path resolution for global installs**: Added `getMcpServerPath()` that resolves the MCP server path via three fallbacks: local `node_modules` → global npm root (`npm root -g`) → relative dev paths. Previously `ensureToolMcpConfig()` and `ensureRootMcpRegistration()` hardcoded `./node_modules/gsd-qdrant-knowledge/...` which failed when the package was installed globally. Also fixed `getGlobalNodeModulesPath()` to use `{ shell: true }` in `spawnSync` for Windows `npm.cmd` compatibility.

## 2.0.8

### Fixed

- **MCP server loading in npm-installed scenario**: The MCP server now uses `require.resolve('gsd-qdrant-knowledge')` for proper npm module resolution, with a relative path fallback for local development. Previously it only tried hardcoded `../..` / `../` paths which failed when both packages were installed globally as separate npm packages.
- **Dependency version alignment**: Aligned `zod` (^4.3.6) and `@modelcontextprotocol/sdk` (^1.29.0) versions between the main package and the MCP server sub-package.
- **MCP server standalone publishability**: Added `bin` field and `peerDependencies` to `src/gsd-qdrant-mcp/package.json` so it can be published and consumed as a standalone npm package.

### Updated

- `src/gsd-qdrant-mcp/README.md` — corrected tool name (`auto_retrieve` instead of `retrieve_context`), updated dependency versions, added peer dependency documentation.

## 2.0.7

### Changed

- Il bootstrap non crea più `gsd-qdrant-knowledge/agent/extensions/gsd/index.js`.
- Gli asset runtime del tool restano dentro `gsd-qdrant-knowledge/` con struttura più corta.
- La registrazione MCP avviene tramite `.mcp.json` nella root del progetto, senza scrivere dentro `.gsd/`.
- Il retrieval MCP favorisce risultati cross-project e contenuti `reusable`, senza escludere il progetto corrente.

### Added

- Comando `gsd-qdrant-knowledge uninstall` per rimuovere gli artifact del tool dal progetto.
- File `gsd-qdrant-knowledge/mcp.json` come stato/config locale del tool.

### Fixed

- GSD ora può scoprire il server MCP del tool tramite `.mcp.json` in root.
- Allineata la documentazione esterna (`README.md`, `GSD-QDRANT-SETUP.md`) al flusso reale.

## 2.0.6

### Fixed

- **GSD extension index.js not created**: The CLI now creates the `gsd-qdrant-knowledge/agent/extensions/gsd/index.js` file when initializing a new project. This file is required for the auto-retrieve MCP hook to be properly loaded.

## 2.0.5

### Fixed

- **MCP server not included in npm package**: Updated `package.json` files section to include the entire `src/gsd-qdrant-mcp/` directory instead of just `index.js`. Removed invalid reference to non-existent `node_modules/gsd-qdrant-knowledge/` path.

## 2.0.2

### Fixed

- **Dependency installation in wrong directory**: The CLI was using the string `'project root'` instead of the actual `PROJECT_ROOT` path for `npm install`, causing installation failures.
- **Windows shell compatibility**: Added `shell: true` to `spawnSync` calls - required for CMD executables (like `npm.cmd`) on Windows. Exit codes were always `null` without this.
- **Obsolete log messages**: Fixed `install-gsd-extension.js` to only print "Created" messages when files are actually being created for the first time, not on every run.

## 2.0.0

### Added

- **Auto-retrieve MCP Hook**: Estensione GSD che abilita il retrieving automatico del contesto cross-project prima di ogni risposta.
- **MCP SDK integration**: Il server MCP `gsd-qdrant` ora utilizza `@modelcontextprotocol/sdk` per una comunicazione più robusta con GSD.
- **Installazione automatica dell'estensione GSD**: Quando il CLI viene eseguito per la prima volta, installa automaticamente l'estensione GSD che abilita il retrieving automatico.
