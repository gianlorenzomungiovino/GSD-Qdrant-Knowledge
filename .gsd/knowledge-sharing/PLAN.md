# Knowledge Sharing - Piano di Implementazione (Aggiornato)

## Visione Generale

Creare un sistema di **Cross-Project Knowledge Retrieval** che permetta ai progetti di condividere e riutilizzare conoscenza dalla collection unificata `gsd_memory` di Qdrant.

## Obiettivi

1. **Knowledge Sharing tra progetti**: Permettere a un progetto di recuperare soluzioni implementate in altri progetti
2. **Pattern Discovery**: Identificare pattern comuni tra diversi progetti
3. **Problem-Solution Mapping**: Collegare problemi simili e le relative soluzioni
4. **Reusable Components**: Facilitare il riutilizzo di componenti riutilizzabili tra progetti

## Architettura

### Componenti Principali

```
┌─────────────────────────────────────────────────────────────────┐
│                    Knowledge Sharing System                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Project A   │  │  Project B   │  │  Project C           │ │
│  │  (gsd_memory)│  │  (gsd_memory)│  │  (gsd_memory)        │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘ │
│         │                  │                      │             │
│         └──────────────────┼──────────────────────┘             │
│                            │                                     │
│                    ┌───────▼───────┐                            │
│                    │  Qdrant Core   │                            │
│                    │  Collection    │                            │
│                    │  gsd_memory    │                            │
│                    └───────┬───────┘                            │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                │
│         │                  │                  │                │
│  ┌──────▼──────┐  ┌───────▼───────┐  ┌──────▼──────┐        │
│  │ MCP Server  │  │  REST API     │  │ CLI Tool    │        │
│  │ Knowledge   │  │  Knowledge    │  │ Knowledge   │        │
│  │ Retrieval   │  │  Retrieval    │  │ Sharing     │        │
│  └─────────────┘  └───────────────┘  └─────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Model

#### Payload di `gsd_memory` (aggiornato)

```json
{
  "project_id": "project-a",
  "type": "decision|knowledge|activity|requirement",
  "source": ".gsd/DECISIONS.md",
  "section": "recent_decisions",
  "content": "...",
  "summary": "...",
  "language": "markdown",
  "reusable": true,              // ✨ NEW: Flag per knowledge sharing
  "tags": ["auth", "jwt"],       // ✨ NEW: Tags per categorizzazione
  "category": "security",        // ✨ NEW: Categoria principale
  "importance": 5,
  "timestamp": 1713000000000,
  "hash": "abc123..."
}
```

## Roadmap di Implementazione

### Phase 1: Core Infrastructure (S01)

#### Tasks

**T01: Aggiornare ingestion pipeline per includere metadata di knowledge sharing**
- [ ] Aggiungere campo `reusable` ai payload Qdrant
- [ ] Aggiungere campo `category` ai payload Qdrant
- [ ] Aggiungere campo `tags` ai payload Qdrant
- [ ] Aggiornare `scripts/smart-context-loader/ingestion.js`
- [ ] Aggiornare `scripts/smart-context-loader/qdrant-setup.js`

**T02: Creare motore di retrieval cross-project**
- [ ] Implementare `retrieveCrossProjectKnowledge(query, options)`
- [ ] Supportare filtri: `exclude_projects`, `include_categories`, `min_relevance`
- [ ] Supportare sorting: `by_relevance`, `by_recency`, `by_importance`
- [ ] Aggiungere ranking per `reusable: true`

**T03: Creare script CLI per knowledge sharing**
- [ ] Implementare `gsd-qdrant knowledge share <query>`
- [ ] Supportare output formattato (JSON, markdown, plain text)
- [ ] Supportare filtering e sorting
- [ ] Aggiungere help e documentazione

### Phase 2: MCP Server & API (S02)

#### Tasks

**T04: Creare MCP server per knowledge retrieval**
- [ ] Implementare `get_cross_project_knowledge` tool
- [ ] Implementare `get_project_knowledge` tool (per singolo progetto)
- [ ] Implementare `list_projects` tool (per elencare progetti indicizzati)
- [ ] Implementare `search_knowledge` tool (ricerca avanzata)

**T05: Creare REST API per knowledge retrieval**
- [ ] Implementare endpoint `POST /api/knowledge/retrieve`
- [ ] Implementare endpoint `GET /api/projects/list`
- [ ] Implementare endpoint `GET /api/categories/list`
- [ ] Aggiungere autenticazione e rate limiting

**T06: Creare agenti autonomi per knowledge curation**
- [ ] Implementare `KnowledgeCurationAgent`
- [ ] Analizzare progetti e trovare pattern comuni
- [ ] Suggerire knowledge sharing automatico
- [ ] Aggiornare automaticamente metadata `reusable` e `category`

### Phase 3: UI & Integration (S03)

#### Tasks

**T07: Creare interfaccia web per knowledge sharing**
- [ ] Implementare search interface
- [ ] Implementare visualizzazione risultati
- [ ] Implementare filtering e sorting
- [ ] Aggiungere export per risultati

**T08: Integrare con GSD auto**
- [ ] Aggiornare GSD auto per usare knowledge sharing
- [ ] Aggiungere suggerimenti automatici di knowledge sharing
- [ ] Aggiornare STATE.md con risultati di knowledge sharing

**T09: Documentazione e testing**
- [ ] Documentare API MCP e REST
- [ ] Creare test per tutte le funzioni
- [ ] Aggiornare README.md
- [ ] Creare esempi di utilizzo

## File Structure

```
knowledge-sharing/
├── scripts/
│   ├── knowledge-sharing/
│   │   ├── index.js              # Entry point CLI
│   │   ├── retriever.js          # Cross-project retriever
│   │   ├── mcp-server.js         # MCP server implementation
│   │   ├── rest-api.js           # REST API implementation
│   │   └── agents/
│   │       ├── knowledge-curation.js
│   │       └── pattern-discovery.js
│   └── smart-context-loader/
│       ├── smartLoader.js        # DEPRECATED - will be removed
│       └── ingestion.js          # Updated with new metadata
├── .gsd/
│   └── knowledge-sharing/
│       ├── PLAN.md               # This file
│       ├── ARCHITECTURE.md       # Detailed architecture
│       └── API.md                # API documentation
└── docs/
    ├── knowledge-sharing.md      # User-facing documentation
    └── api/
        ├── mcp-api.md
        └── rest-api.md
```

## Technical Decisions

### Decision 1: Usare Qdrant collection unificata `gsd_memory`

**Scelta**: Continuare a usare la collection unificata invece di creare collection separate per progetto.

**Ragionamento**:
- Riduce la complessità (single collection invece di multiple)
- Permette retrieval cross-project nativo
- Facilita il filtering per `project_id`
- Già implementato e testato

### Decision 2: Aggiungere metadata `reusable`, `category`, `tags` ai payload

**Scelta**: Aggiungere questi campi ai payload Qdrant invece di creare collezioni separate.

**Ragionamento**:
- Mantieni la struttura semplice (single collection)
- Permette filtering avanzato (es. `reusable: true AND category: "security"`)
- Facilita il ranking personalizzato
- Non richiede migration di dati esistenti

### Decision 3: Esporre knowledge sharing tramite MCP server + REST API

**Scelta**: Creare sia MCP server che REST API invece di scegliere uno solo.

**Ragionamento**:
- MCP server per integrazione con strumenti AI (Claude, Cursor, ecc.)
- REST API per accesso programmatico e integrazione con altri sistemi
- Copre più use cases e utenti
- Entrambi possono coesistere senza conflitti

### Decision 4: Usare agenti autonomi per knowledge curation

**Scelta**: Implementare agenti autonomi per analizzare progetti e suggerire knowledge sharing.

**Ragionamento**:
- Riduce il carico manuale di tagging e categorizzazione
- Scopre pattern che gli umani potrebbero perdere
- Aggiorna automaticamente metadata `reusable` e `category`
- Scalabile per molti progetti

## Success Metrics

1. **Adozione**: Numero di progetti che usano knowledge sharing
2. **Riutilizzo**: Numero di componenti riutilizzati tra progetti
3. **Tempo risparmiato**: Tempo medio risparmiato grazie a knowledge sharing
4. **Soddisfazione utente**: Rating degli utenti su knowledge sharing
5. **Copertura**: Percentuale di progetti con metadata completi

## Rischi e Mitigazione

### Rischio 1: Performance del retrieval cross-project

**Mitigazione**:
- Usare caching per query frequenti (MCP cache built-in)
- Implementare indicizzazione ottimizzata su Qdrant
- Aggiungere paginazione per risultati grandi

### Rischio 2: Privacy e sicurezza dei dati

**Mitigazione**:
- Aggiungere opzioni di filtering per escludere progetti sensibili
- Implementare autenticazione per API
- Aggiungere logging e auditing

### Rischio 3: Complessità del sistema

**Mitigazione**:
- Mantenere l'API semplice e ben documentata
- Fornire esempi di utilizzo
- Creare test automatici per tutte le funzioni

## Next Steps

1. ✅ Creare branch "knowledge-sharing"
2. ✅ Creare file di pianificazione (questo file)
3. ⏳ Implementare Phase 1 (Core Infrastructure)
4. ⏳ Implementare Phase 2 (MCP Server & API)
5. ⏳ Implementare Phase 3 (UI & Integration)
6. ⏳ Testing e documentazione
7. ⏳ Merge in main branch

---

**Last updated**: 2026-04-13
**Author**: Gianlorenzo
**Version**: 2.0 (Updated - removed Smart Context Loader)
