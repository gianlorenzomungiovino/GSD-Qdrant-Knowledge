# M002: Miglioramento MCP Server GSD-Qdrant: da passivo ad attivo

## Vision
Migliorare il MCP server GSD-Qdrant da passivo (richiede query manuale) ad attivo (retrieval automatico basato sul task dell'utente). Questo abilita l'LLM a ottenere contesto rilevante senza round-trip manuali, riducendo token e migliorando l'esperienza utente.

## Slice Overview
| ID | Slice | Risk | Depends | Done | After this |
|----|-------|------|---------|------|------------|
| S01 | Implementazione tool auto_retrieve | low | — | ⬜ | L'MCP server ha un nuovo strumento `auto_retrieve` che estrae automaticamente parole chiave dal task e fa retrieval su Qdrant |
| S02 | Testing e validazione | low | S01 | ⬜ | Tutti i test passano e il retrieval automatico funziona correttamente per vari tipi di task |
| S03 | Documentazione e integrazione | low | S02 | ⬜ | La documentazione è aggiornata e il MCP server è pronto per l'uso |
