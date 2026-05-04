# M004: Installazione automatica istruzioni auto_retrieve in KNOWLEDGE.md

## Vision
Rendere discoverable il tool auto_retrieve scrivendo automaticamente istruzioni nel file ~/.gsd/agent/KNOWLEDGE.md durante l'installazione del pacchetto. Questo file viene iniettato automaticamente nel system prompt di GSD ad ogni sessione, quindi l'LLM sa che può interrogare Qdrant via MCP senza doverlo configurare manualmente.

## Slice Overview
| ID | Slice | Risk | Depends | Done | After this |
|----|-------|------|---------|------|------------|
| S01 | S01 | low | — | ✅ | Il modulo esiste ed esporta ensureAutoRetrieveInstructions() |
| S02 | S02 | low | — | ✅ | Eseguendo 'gsd-qdrant-knowledge' in un progetto, KNOWLEDGE.md viene aggiornato automaticamente |
| S03 | S03 | low | — | ✅ | Il pacchetto include il nuovo file e l'installazione funziona su un progetto GSD pulito |
