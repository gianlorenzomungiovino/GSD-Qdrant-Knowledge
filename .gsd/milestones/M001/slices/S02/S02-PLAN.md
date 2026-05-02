# S02: Testing e validazione

**Goal:** Validare che lo strumento `auto_retrieve` funzioni correttamente per vari tipi di task e che il retrieval automatico non introduca errori o regressioni.
**Demo:** Tutti i test passano

## Must-Haves

- Not provided.

## Proof Level

- This slice proves: Not provided.

## Integration Closure

Not provided.

## Verification

- npm test -- --testNamePattern "S02-core" passa con coverage >80%
- npm test -- --testNamePattern "S02-integration" passa
- node scripts/validate-auto-retrieve.js ritorna exit code 0

## Tasks

- [x] **T01: Scrivere unit tests per funzioni core** `est:45m`
  Testare le funzioni di base che estraggono keyword e generano query assicura che la logica fondamentale sia corretta prima di testare l'integrazione completa
  - Files: `tests/auto-retrieve.unit.test.js`
  - Verify: npm test -- --grep "S02-core" passa con coverage >80%

- [x] **T02: Scrivere integration tests per MCP server** `est:1h`
  Testare lo strumento MCP tramite stdio assicura che l'interfaccia di comunicazione funzioni correttamente e che i risultati siano formattati come atteso
  - Files: `tests/auto-retrieve.integration.test.js`
  - Verify: npm test -- --testNamePattern "S02-integration" passa

- [x] **T03: Creare script di validazione confronto** `est:1h`
  Confrontare auto_retrieve con query manuali su scenari reali dimostra che il retrieval automatico produce risultati rilevanti e non introduce regressioni
  - Files: `scripts/validate-auto-retrieve.js`, `tests/scenarios.json`
  - Verify: node scripts/validate-auto-retrieve.js ritorna exit code 0

- [x] **T04: Aggiornare configurazione .env e documentation** `est:1h`
  Aggiungere nuove variabili ambiente per Qdrant embedded e aggiornare la documentation
  - Files: `.env.template`, `README.md`, `GSD-QDRANT-SETUP.md`
  - Verify: Check che le variabili siano documentate correttamente

- [x] **T05: Testare dashboard browser e funzionalità complete** `est:2h`
  Verificare che la dashboard sia accessibile e tutte le features siano operative
  - Verify: Browser test su http://localhost:6333/dashboard

- [x] **T06: Test di migrazione dati da Docker a embedded** `est:2h`
  Verificare che i dati esistenti possano essere usati con embedded senza migrazione
  - Verify: Test con database esistente

## Files Likely Touched

- tests/auto-retrieve.unit.test.js
- tests/auto-retrieve.integration.test.js
- scripts/validate-auto-retrieve.js
- tests/scenarios.json
- .env.template
- README.md
- GSD-QDRANT-SETUP.md
