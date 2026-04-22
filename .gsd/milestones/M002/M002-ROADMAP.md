# M002: Miglioramenti Ricerca e Deployment

**Vision:** Migliorare la precisione della ricerca semantica con embedding ibrido e rendere il tool plug-and-play con Qdrant embedded che include la dashboard browser senza limitazioni rispetto alla versione Docker.

## Slices

- [x] **S01: Implementare Embedding Ibrido (Vettoriale + Testuale)** `risk:low` `depends:[]`
  > After this: La ricerca restituisce risultati più precisi combinando similarità vettoriale e match testuale

- [ ] **S02: S02** `risk:medium` `depends:[]`
  > After this: Qdrant parte automaticamente con il CLI e la dashboard è accessibile via browser

- [ ] **S03: Documentazione e integrazione** `risk:low` `depends:[S02]`
  > After this: La documentazione è aggiornata e il MCP server è pronto per l'uso

## Boundary Map

Not provided.
