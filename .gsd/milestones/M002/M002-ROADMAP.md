# M002: Miglioramenti Ricerca e Deployment

## Vision
Migliorare la precisione della ricerca semantica con embedding ibrido e rendere il tool plug-and-play con Qdrant embedded che include la dashboard browser senza limitazioni rispetto alla versione Docker.

## Slice Overview
| ID | Slice | Risk | Depends | Done | After this |
|----|-------|------|---------|------|------------|
| S01 | Implementare Embedding Ibrido (Vettoriale + Testuale) | low | — | ⬜ | La ricerca restituisce risultati più precisi combinando similarità vettoriale e match testuale |
| S02 | Qdrant Embedded con Dashboard Browser | medium | — | ⬜ | Qdrant parte automaticamente con il CLI e la dashboard è accessibile via browser |
