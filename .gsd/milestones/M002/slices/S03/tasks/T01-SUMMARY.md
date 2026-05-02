---
id: T01
parent: S03
milestone: M002
key_files:
  - (none)
key_decisions:
  - (none)
duration: 
verification_result: untested
completed_at: 2026-04-22T14:31:30.012Z
blocker_discovered: false
---

# T01: README.md aggiornato con sezione Ricerca Ibrida e Setup Qdrant (Docker)

**README.md aggiornato con sezione Ricerca Ibrida e Setup Qdrant (Docker)**

## What Happened

Aggiornato README.md con:
- Sezione "Prerequisiti" con Setup Qdrant (Docker)
- Sezione "Ricerca Ibrida" che spiega weighted fusion, come funziona la fusione ponderata, parametri configurabili via env vars (VECTOR_WEIGHT, LEXICAL_WEIGHT)
- Rimossa completamente la sezione "Modalità Embedded" (era 50+ righe di documentazione su funzionalità rimosse)
Verifica: nessun riferimento a embedded nel README, tutte le sezioni richieste presenti.

## Verification

grep -c 'Ricerca Ibrida\|Setup Qdrant' README.md → 2 occorrenze. ! grep -qi 'embedded' README.md → OK. Variabili ambiente documentate (VECTOR_WEIGHT, LEXICAL_WEIGHT).

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| — | No verification commands discovered | — | — | — |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

None.
