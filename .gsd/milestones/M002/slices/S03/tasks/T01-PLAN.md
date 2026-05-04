---
estimated_steps: 10
estimated_files: 1
skills_used: []
---

# T01: Aggiornare README.md con sezione Ricerca Ibrida

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

## Inputs

- `.gsd/milestones/M002/slices/S01/T02-SUMMARY.md`
- `.gsd/milestones/M002/slices/S01/T03-SUMMARY.md`

## Expected Output

- `README.md`

## Verification

grep -c 'Ricerca Ibrida\|Setup Qdrant' README.md && ! grep -qi 'embedded' README.md
