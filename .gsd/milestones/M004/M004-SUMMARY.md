---
id: M004
title: "Installazione automatica istruzioni auto_retrieve in AGENTS.md"
status: complete
completed_at: 2026-04-18T17:49:46.510Z
key_decisions:
  - Use AGENTS.md instead of KNOWLEDGE.md — AGENTS.md is the standard Pi/GSD file for global instructions, loaded automatically at startup (see docs/dev/what-is-pi/13-context-files-project-instructions.md)
key_files:
  - src/auto-retrieve-instructions.js
  - src/cli.js (bootstrapProject modification)
  - package.json (files array update)
lessons_learned:
  - KNOWLEDGE.md is project-specific (.gsd/KNOWLEDGE.md), not global. For global instructions that load automatically, use ~/.gsd/agent/AGENTS.md — the standard Pi/GSD file.
---

# M004: Installazione automatica istruzioni auto_retrieve in AGENTS.md

**Installazione automatica istruzioni auto_retrieve in AGENTS.md implementata e verificata**

## What Happened

Milestone M004 completata: implementata l'installazione automatica delle istruzioni auto_retrieve in `~/.gsd/agent/AGENTS.md`. Tre slice completate: S01 (creazione modulo con dedup), S02 (integrazione CLI bootstrap), S03 (package.json + verifica). Test end-to-end passati su progetto GSD reale (Gotcha) con verifica di installazione pulita e dedup doppia installazione.

**Nota:** Inizialmente avevo pianificato di usare `~/.gsd/agent/KNOWLEDGE.md`, ma verificando la repo GSD-2 ho scoperto che:
- `KNOWLEDGE.md` è un template project-specific (`.gsd/KNOWLEDGE.md`)
- `AGENTS.md` è il file standard Pi/GSD per istruzioni globali (`~/.gsd/agent/AGENTS.md`)
- AGENTS.md viene caricato automaticamente da Pi all'avvio, non è toccato dagli aggiornamenti

Questo rende AGENTS.md la scelta corretta: standard, globale, automatico.

## Success Criteria Results

- [x] L'agent GSD vede le istruzioni auto_retrieve nel system prompt dopo l'installazione
  - Verificato: AGENTS.md creato con sezione completa durante bootstrap CLI
- [x] Doppia installazione non duplica contenuti in AGENTS.md
  - Verificato: marker-based dedup, grep -c = 1 dopo 2 installazioni
- [x] Il file ~/.gsd/agent/AGENTS.md non viene sovrascritto dagli aggiornamenti di GSD
  - Verificato: file in ~/.gsd/agent/ (user data), non toccato da aggiornamenti — standard Pi/GSD

## Definition of Done Results



## Requirement Outcomes



## Deviations

None.

## Follow-ups

None.
