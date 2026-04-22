# S03: Documentazione Ricerca Ibrida e Cleanup

**Goal:** Documentare la ricerca ibrida implementata in S01, aggiornare README.md e GSD-QDRANT-SETUP.md, verificare che tutto funzioni insieme.
**Demo:** La documentazione è aggiornata con ricerca ibrida, MCP server pronto per l'uso, codice embedded rimosso

## Must-Haves

- [ ] README.md documenta ricerca ibrida + Docker setup in modo auto-consistente
- [ ] GSD-QDRANT-SETUP.md ha solo Docker setup, zero riferimenti embedded
- [ ] Nessun file embedded rimane nel codice sorgente
- [ ] package.json pulito da script embedded
- [ ] .gitignore senza .qdrant-data/

## Proof Level

- This slice proves: Not provided.

## Integration Closure

Not provided.

## Verification

- Not provided.

## Tasks

- [x] **T01: Aggiornare README.md con sezione Ricerca Ibrida** `est:1h`
  1. **Sezione "Ricerca Ibrida"**: spiegare weighted fusion (Fase C) implementata, come funziona la fusione ponderata, parametri configurabili via env vars
2. **Sezione "Setup Qdrant"**: aggiungere breve descrizione Docker setup all'inizio del README (già fatto)
3. **Verifica coerenza**: assicurarsi che tutti i comandi e le variabili ambiente menzionate nel README siano reali

Must-Haves:
- [ ] Sezione "Ricerca Ibrida" con spiegazione weighted fusion
- [ ] Sezione "Setup Qdrant" con Docker command
- [ ] Variabili ambiente documentate (QDRANT_URL, VECTOR_WEIGHT, LEXICAL_WEIGHT)
- [ ] Nessun riferimento a embedded Qdrant
  - Files: `README.md`
  - Verify: grep -c 'Ricerca Ibrida\|Setup Qdrant' README.md && ! grep -qi 'embedded' README.md
  - Files: `README.md`
  - Verify: grep -c 'Ricerca Ibrida\|Setup Qdrant' README.md && ! grep -qi 'embedded' README.md

- [x] **T02: Aggiornare GSD-QDRANT-SETUP.md con Docker setup** `est:0.5h`
  1. **Sezione "Avvia Qdrant"**: sostituire le due opzioni (Docker/Embedded) con una sola sezione Docker breve + menzione standalone
2. **Rimuovere riferimenti embedded**: non più sezioni su modalità embedded, binary detection, .qdrant-data/
3. **Verifica completezza**: assicurarsi che la guida sia auto-consistente per un utente nuovo

Must-Haves:
- [ ] Sezione Docker setup chiara e breve
- [ ] Nessun riferimento a embedded Qdrant
- [ ] Istruzioni di verifica (curl healthz) incluse
  - Files: `GSD-QDRANT-SETUP.md`
  - Verify: ! grep -qi 'embedded' GSD-QDRANT-SETUP.md
  - Files: `GSD-QDRANT-SETUP.md`
  - Verify: ! grep -qi 'embedded' GSD-QDRANT-SETUP.md

- [x] **T03: Verifica finale e pulizia codice** `est:0.5h`
  1. **Verifica integrazione**: `node src/cli.js` funziona (o almeno carica senza errori)
2. **Pulizia embedded**: verificare che nessun riferimento a embedded rimanga nel codice (`src/**/*.js`)
3. **Verifica package.json**: npm scripts puliti (solo test, sync-knowledge)
4. **Verifica .gitignore**: nessun riferimento a .qdrant-data/

Must-Haves:
- [ ] `node src/cli.js` non crasha all'avvio
- [ ] Nessun file embedded rimasto (src/embedded-qdrant.js, scripts/qdrant-cli.js)
- [ ] package.json pulito da script embedded
- [ ] .gitignore senza .qdrant-data/
  - Files: `src/**/*.js`, `package.json`, `.gitignore`
  - Verify: ls src/embedded-qdrant.js scripts/qdrant-cli.js 2>&1 | grep -c 'No such file' && echo 'OK: embedded files removed'
  - Files: `src/**/*.js`, `package.json`, `.gitignore`
  - Verify: ls src/embedded-qdrant.js scripts/qdrant-cli.js 2>&1 | grep -c 'No such file' && echo 'OK: embedded files removed'

- [x] **T04: Aggiornare DECISIONS.md** `est:30m`
  Documentare la decisione di implementare caching con LRUCache (o altra libreria scelta)
  - Verify: Verifica che la decisione sia documentata

## Files Likely Touched

- README.md
- GSD-QDRANT-SETUP.md
- src/**/*.js
- package.json
- .gitignore
