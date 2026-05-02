---
estimated_steps: 18
estimated_files: 2
skills_used: []
---

# T01: Creare modulo embedded Qdrant

# Creare `src/embedded-qdrant.js`

## Steps
1. **Struttura del modulo**: Esportare `EmbeddedQdrant` con metodi: `start()`, `stop()`, `waitForReady()`, `storageDir`, `url`, `pid`
2. **Rilevamento versione installata**: `detectBinary()` — cerca `qdrant` in PATH, `/usr/local/bin/qdrant`, `/opt/homebrew/bin/qdrant` (macOS Intel), `/opt/homebrew/Cellar/qdrant/` (macOS Homebrew), e sul path npm globale. Su Windows cerca anche il percorso npm globale di sistema.
3. **Gestione dipendenze**: `installBinary()` — verifica la presenza della dipendenza necessaria e, se assente, la installa nella directory locale `.gsd/bin/qdrant`. Versione fissata a `v1.13.6` per compatibilità con il client JS.
4. **Avvio server**: `start()` — lancia il server come processo figlio con `--storage ./.qdrant-data/ --port 6333`, restituisce il PID
5. **Readiness check**: `waitForReady()` — poll HTTP `GET http://localhost:6333/healthz` con timeout di 30s, intervallo 500ms. Verifica che la risposta contenga `{"status":"ok"}`
6. **Shutdown**: `stop()` — invia SIGTERM al processo figlio, aspetta max 10s, poi forza la terminazione con SIGKILL
7. **Cleanup**: registrare `process.on('SIGINT', ...)` e `process.on('SIGTERM', ...)` per fermare il server. Anche `process.on('exit')` come fallback
8. **Configurazione**: esporre opzioni via env vars: `QDRANT_EMBEDDED_DIR`, `QDRANT_EMBEDDED_PORT`

## Must-Haves
- [ ] Il modulo rileva automaticamente la versione corretta per la piattaforma (Linux/macOS/Windows)
- [ ] Se la dipendenza non è presente, la installa nella directory locale
- [ ] Il server parte con storage embedded in `./.qdrant-data/` (configurabile via env)
- [ ] `waitForReady()` verifica che il server sia pronto controllando /healthz
- [ ] `stop()` ferma il server e rilascia le risorse
- [ ] Il modulo è idempotente: start multipli non creano duplicati
- [ ] Cleanup automatico su SIGINT/SIGTERM/exit

## Inputs

- `package.json`

## Expected Output

- `src/embedded-qdrant.js`
- `.qdrant-data/ (runtime)`

## Verification

node -e "const {EmbeddedQdrant} = require('./src/embedded-qdrant.js'); const q = new EmbeddedQdrant(); console.log(q.storageDir);"
