---
id: T01
parent: S01
milestone: M004
key_files:
  - (none)
key_decisions:
  - (none)
duration: 
verification_result: untested
completed_at: 2026-04-18T17:44:03.860Z
blocker_discovered: false
---

# T01: Creato modulo src/auto-retrieve-instructions.js con funzione ensureAutoRetrieveInstructions()

**Creato modulo src/auto-retrieve-instructions.js con funzione ensureAutoRetrieveInstructions()**

## What Happened

Il modulo esporta ensureAutoRetrieveInstructions() che: 1) Legge ~/.gsd/agent/KNOWLEDGE.md (se esiste), 2) Controlla se la sezione 'Cross-Project Knowledge Retrieval (Qdrant)' è già presente, 3) Se non presente, crea la directory e appende la sezione con istruzioni complete su quando e come usare auto_retrieve. Safe-to-run-multiple-times grazie al marker-based dedup.

## Verification

1. Module export verificato: node -e "const m = require('./src/auto-retrieve-instructions'); console.log(typeof m.ensureAutoRetrieveInstructions)" → function\n2. Prima esecuzione: 📝 Created ~/.gsd/agent/KNOWLEDGE.md (auto-retrieve instructions)\n3. Seconda esecuzione: ℹ️ Auto-retrieve instructions already in KNOWLEDGE.md (dedup funziona)\n4. grep -c conferma 1 occorrenza del marker dopo 2 esecuzioni\n5. Contenuto file verificato: sezione completa con When to use, How to use, Notes

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
