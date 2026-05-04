---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T02: Aggiornare GSD-QDRANT-SETUP.md con Docker setup

1. **Sezione "Avvia Qdrant"**: sostituire le due opzioni (Docker/Embedded) con una sola sezione Docker breve + menzione standalone
2. **Rimuovere riferimenti embedded**: non più sezioni su modalità embedded, binary detection, .qdrant-data/
3. **Verifica completezza**: assicurarsi che la guida sia auto-consistente per un utente nuovo

Must-Haves:
- [ ] Sezione Docker setup chiara e breve
- [ ] Nessun riferimento a embedded Qdrant
- [ ] Istruzioni di verifica (curl healthz) incluse
  - Files: `GSD-QDRANT-SETUP.md`
  - Verify: ! grep -qi 'embedded' GSD-QDRANT-SETUP.md

## Inputs

- `GSD-QDRANT-SETUP.md`

## Expected Output

- `GSD-QDRANT-SETUP.md`

## Verification

! grep -qi 'embedded' GSD-QDRANT-SETUP.md
