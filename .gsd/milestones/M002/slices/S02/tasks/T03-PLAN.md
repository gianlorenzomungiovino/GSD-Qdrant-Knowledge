---
estimated_steps: 20
estimated_files: 4
skills_used: []
---

# T03: Aggiungere script npm e documentazione embedded

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

## Inputs

- `src/embedded-qdrant.js`
- `src/cli.js`

## Expected Output

- `package.json`
- `README.md`
- `.gitignore`
- `GSD-QDRANT-SETUP.md`

## Verification

grep -c 'qdrant' package.json && grep -q '.qdrant-data' .gitignore
