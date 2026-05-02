---
estimated_steps: 11
estimated_files: 3
skills_used: []
---

# T03: Verifica finale e pulizia codice

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

## Inputs

- None specified.

## Expected Output

- `src/**/*.js`
- `package.json`
- `.gitignore`

## Verification

ls src/embedded-qdrant.js scripts/qdrant-cli.js 2>&1 | grep -c 'No such file' && echo 'OK: embedded files removed'
