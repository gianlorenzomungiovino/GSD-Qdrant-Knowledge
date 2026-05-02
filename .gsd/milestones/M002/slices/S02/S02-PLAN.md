# S02: Qdrant Embedded con Dashboard Browser

**Goal:** Configurare Qdrant embedded per funzionare senza Docker, includendo la dashboard browser accessibile via localhost.
**Demo:** Qdrant parte automaticamente con il CLI e la dashboard è accessibile via browser

## Must-Haves

- QDrant parte automaticamente quando il CLI viene eseguito e non trova un server esterno
- La dashboard browser è accessibile su http://localhost:6333/dashboard
- Lo storage embedded è in .qdrant-data/ (non committato)
- L'embedded mode funziona con la stessa API del remote mode

## Proof Level

- This slice proves: integration

## Integration Closure

- Upstream surfaces consumed: src/gsd-qdrant-template.js (QDrant client), src/sync-knowledge.js (sync logic)
- New wiring introduced in this slice: src/embedded-qdrant.js (lifecycle manager), src/cli.js (integration point)
- What remains before the milestone is truly usable end-to-end: nothing — embedded QDrant is fully functional with dashboard

## Verification

- Runtime signals: embedded QDrant PID, storage path, port
- Inspection surfaces: `node src/embedded-qdrant.js --status`, curl http://localhost:6333/healthz
- Failure visibility: start error, readiness timeout, SIGTERM/SIGKILL status
- Redaction constraints: none

## Tasks

- [x] **T01: Creare modulo embedded Qdrant** `est:2h`
  # Creare `src/embedded-qdrant.js`

## Steps
1. **Struttura del modulo**: Esportare `EmbeddedQdrant` con metodi: `start()`, `stop()`, `waitForReady()`, `storageDir`, `url`, `pid`
2. **Rilevamento binario**: `detectBinary()` — cerca `qdrant` in PATH, `/usr/local/bin/qdrant`, `/opt/homebrew/bin/qdrant` (macOS Intel), `/opt/homebrew/Cellar/qdrant/` (macOS Homebrew), e sul path npm globale. Su Windows cerca anche `C:\Program Files\qdrant\qdrant.exe` e il percorso npm globale di sistema.
3. **Installazione automatica**: `installBinary()` — scarica dal release GitHub (`https://github.com/qdrant/qdrant/releases/download/v1.17.1/...`) e lo installa in `.gsd/bin/qdrant`. Versione fissata a `v1.17.1` (latest stable, Feb 2026) per compatibilità con il client JS e supporto nativo sparse vectors + RRF.
4. **Avvio server**: `start()` — lancia il binario con `--storage ./.qdrant-data/ --port 6333` come subprocess, restituisce il PID
5. **Readiness check**: `waitForReady()` — poll HTTP `GET http://localhost:6333/healthz` con timeout di 30s, intervallo 500ms. Verifica che la risposta contenga `{"status":"ok"}`
6. **Shutdown**: `stop()` — invia SIGTERM al subprocess, aspetta max 10s, poi SIGKILL
7. **Cleanup**: registrare `process.on('SIGINT', ...)` e `process.on('SIGTERM', ...)` per fermare il server. Anche `process.on('exit')` come fallback
8. **Configurazione**: esporre opzioni via env vars: `QDRANT_EMBEDDED_DIR`, `QDRANT_EMBEDDED_PORT`

## Must-Haves
- [ ] Il modulo rileva automaticamente il binario corretto per la piattaforma (Linux/macOS/Windows)
- [ ] Se il binario non è presente, lo scarica dal release GitHub ufficiale v1.17.1
- [ ] Il server parte con storage embedded in `./.qdrant-data/` (configurabile via env)
- [ ] `waitForReady()` verifica che il server sia pronto controllando /healthz
- [ ] `stop()` ferma il server e rilascia le risorse
- [ ] Il modulo è idempotente: start multipli non creano duplicati
- [ ] Cleanup automatico su SIGINT/SIGTERM/exit
  - Files: `src/embedded-qdrant.js`, `.gsd/bin/qdrant (runtime)`
  - Verify: node -e "const {EmbeddedQdrant} = require('./src/embedded-qdrant.js'); const q = new EmbeddedQdrant(); console.log(q.storageDir);"

- [x] **T02: Integrare embedded Qdrant nel bootstrap CLI** `est:2h`
  # Integrare embedded QDrant nel flusso di bootstrap di `src/cli.js`

## Steps
1. **Import**: in `src/cli.js`, importare `EmbeddedQdrant` da `src/embedded-qdrant.js`
2. **Modificare `bootstrapProject()`**: prima di chiamare sync-knowledge, verificare se QDrant esterno è disponibile usando `GET http://localhost:6333/healthz`. Se la risposta non contiene `{"status":"ok"}`, avviare embedded QDrant.
3. **Swap env vars**: temporaneamente sovrascrivere `QDRANT_URL` a `http://localhost:6333` (se non già impostato) quando si usa embedded
4. **Sync**: eseguire il sync con l'embedded server in funzione
5. **Lasciare QDrant in background**: NON fermare l'embedded server dopo il bootstrap. Lasciarlo in esecuzione con la dashboard accessibile
6. **Graceful shutdown**: registrare handler su `process.on('SIGINT', ...)` e `process.on('SIGTERM', ...)` per fermare l'embedded server prima dell'exit
7. **Aggiornare `uninstallProjectArtifacts()`**: rimuovere solo `.qdrant-data/` se è stato usato embedded QDrant (non se l'utente usa Docker)
8. **Testare il flusso completo**: `node src/cli.js` → dovrebbe partire embedded QDrant automaticamente se non c'è server esterno

## Must-Haves
- [ ] Se un server QDrant esterno è già in esecuzione su localhost:6333 (verificato via /healthz), non viene toccato
- [ ] Se nessun server è disponibile, viene avviato embedded QDrant automaticamente
- [ ] Il sync-knowledge funziona con l'embedded server
- [ ] L'embedded server viene lasciato in esecuzione dopo il bootstrap (non fermato)
- [ ] Il cleanup automatico su SIGINT/SIGTERM è operativo
- [ ] `uninstallProjectArtifacts()` non rimuove lo storage se si usa Docker
  - Files: `src/cli.js`, `src/sync-knowledge.js`
  - Verify: node src/cli.js 2>&1 | grep -i 'qdrant\|ready\|sync'

- [x] **T03: Aggiungere script npm e documentazione embedded** `est:1h`
  # Aggiungere npm scripts e documentazione per la modalità embedded

## Steps
1. **`package.json`**: aggiungere script:
   - `start-qdrant`: esegue `node src/embedded-qdrant.js --start` (o script dedicato)
   - `stop-qdrant`: ferma l'embedded QDrant
   - `sync`: esegue il sync con embedded QDrant (avvia → sync → lascia in background)
2. **Script dedicato**: creare `scripts/qdrant-cli.js` (opzionale, se lo script npm non basta)
3. **`.gitignore`**: aggiungere `.qdrant-data/` (storage embedded, non committare)
4. **README.md**: aggiungere sezione "Embedded Mode" con:
   - Spiegazione della modalità embedded
   - Differenze rispetto alla versione Docker
   - Comandi per avviare/arrestare
   - Come verificare che la dashboard sia accessibile (`http://localhost:6333/dashboard`)
5. **GSD-QDRANT-SETUP.md**: aggiungere nota sulla modalità embedded

## Must-Haves
- [ ] `npm run start-qdrant` avvia l'embedded server
- [ ] `npm run stop-qdrant` ferma l'embedded server
- [ ] `.qdrant-data/` è in `.gitignore`
- [ ] README.md documenta la modalità embedded con differenze vs Docker
- [ ] Dashboard browser accessibile a `http://localhost:6333/dashboard`
  - Files: `package.json`, `README.md`, `.gitignore`, `GSD-QDRANT-SETUP.md`
  - Verify: grep -c 'qdrant' package.json && grep -q '.qdrant-data' .gitignore

## Files Likely Touched

- src/embedded-qdrant.js
- .gsd/bin/qdrant (runtime)
- src/cli.js
- src/sync-knowledge.js
- package.json
- README.md
- .gitignore
- GSD-QDRANT-SETUP.md
