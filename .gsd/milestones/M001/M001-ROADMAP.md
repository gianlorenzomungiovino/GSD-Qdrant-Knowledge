# M001: Miglioramento MCP Server GSD-Qdrant: da passivo ad attivo

## Vision
Migliorare il MCP server GSD-Qdrant da passivo (richiede query manuale) ad attivo (retrieval automatico basato sul task dell'utente). Questo abilita l'LLM a ottenere contesto rilevante senza round-trip manuali, riducendo token e migliorando l'esperienza utente.

## Slice Overview
| ID | Slice | Risk | Depends | Done | After this |
|----|-------|------|---------|------|------------|
| S01 | S01 | low | — | ✅ | L'MCP server ha un nuovo strumento `auto_retrieve` |
| S02 | S02 | low | — | ✅ | Tutti i test passano |
| S03 | S03 | low | — | ✅ | Documentazione aggiornata |
