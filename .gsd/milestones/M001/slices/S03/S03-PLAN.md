# S03: Documentazione e integrazione

**Goal:** Documentare lo strumento auto_retrieve e integrarlo nel flusso di lavoro GSD
**Demo:** Documentazione aggiornata

## Must-Haves

- README.md contiene sezione completa auto_retrieve con esempi
- Script esempio esiste e può essere eseguito
- Test E2E passano e coprono il flusso completo

## Proof Level

- This slice proves: contract

## Integration Closure

Upstream: src/gsd-qdrant-mcp/index.js (strumento MCP esistente)
Nuova wiring: documentazione CLI + test E2E
Prima dell'Milestone: documentazione completa e test verificati

## Verification

- Not provided.

## Tasks

- [x] **T01: Aggiornare README.md con documentazione auto_retrieve** `est:1h`
  Aggiungere sezione completa sulla funzionalità auto_retrieve al README principale, includendo esempi d'uso, parametri e risposta formatata.
  - Files: `README.md`, `src/gsd-qdrant-mcp/README.md`
  - Verify: grep -c "## Auto-Retrieve" README.md | grep -q ">= 1" && grep -q "auto_retrieve" README.md

- [x] **T02: Creare esempio di utilizzo CLI** `est:1h`
  Creare uno script di esempio che dimostra l'uso dello strumento auto_retrieve via CLI MCP, con output formattato.
  - Files: `scripts/example-auto-retrieve.js`
  - Verify: test -f scripts/example-auto-retrieve.js && grep -q "auto_retrieve" scripts/example-auto-retrieve.js

- [x] **T03: Verificare integrazione end-to-end** `est:2h`
  Creare test di integrazione end-to-end che valida il flusso completo: richiesta → estrazione keyword → query Qdrant → risultato formattato.
  - Files: `tests/e2e-auto-retrieve.test.js`
  - Verify: npm test -- --testNamePattern "S03" 2>&1 | grep -q "passed"

## Files Likely Touched

- README.md
- src/gsd-qdrant-mcp/README.md
- scripts/example-auto-retrieve.js
- tests/e2e-auto-retrieve.test.js
