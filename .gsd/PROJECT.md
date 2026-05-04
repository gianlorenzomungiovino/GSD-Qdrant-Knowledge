# PROJECT.md

## Current State

**Project:** qdrant-template

**Description:** CLI Node.js per creare e sincronizzare una knowledge base semantica di progetto su Qdrant. Supporta query vettoriali con prefetch, filtri must/should basati sull'intent detection, grouping per documento sorgente, e filtro per soglia di rilevanza.

## Milestones

### M005: Ottimizzazione Retrieval e Performance

**Status:** Active — S01 completata. Prossimo step: S02 (Embedding Fase 2).

#### Slices

| ID | Title | Risk | Depends | Status |
|----|-------|------|---------|--------|
| S01 | Perfezionamento Query Qdrant (Fase 1) | medium | — | Completed |
| S02 | Ottimizzazione Embedding (Fase 2) | high | — | Not started |
| S03 | Re-ranking Risultati (Fase 3) | medium | [S02] | Not started |
| S04 | Cache Query e Normalizzazione (Fase 4) | low | [S01] | Not started |

### M002: Ottimizzazione Embedding e Caching

**Status:** Active

**Vision:** Migliorare la qualità degli embedding e aggiungere caching per ridurre le chiamate API e migliorare le performance

#### Slices

| ID | Title | Risk | Status |
|----|-------|------|--------|
| S01 | Implementare caching embedding | low | Completed |
| S02 | Testing e validazione | low | Not started |

## S01 Deliverables (M005)

- **Prefetch batch** in cli.js e MCP server — query breadth + refinement stretta
- **Group by documento** con searchPointGroups(group_by='source', group_size=2) — max 2 chunk per sorgente
- **Limit=5, score_threshold=0.85** con fallback automatico a 0.75 se <2 risultati
- **Must/Should separation** — language/type/project_id → must[], tags → should[]

## Next Action

Iniziare con **S02: Ottimizzazione Embedding (Fase 2)**.

---

*Last updated: 2026-04-27T16:38:00Z*
