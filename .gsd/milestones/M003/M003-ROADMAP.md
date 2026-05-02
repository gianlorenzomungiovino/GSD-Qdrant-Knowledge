# M003: M003: Miglioramenti Embedding e Performance

**Vision:** Migliorare la qualità degli embedding e aggiungere caching per ridurre le chiamate API e migliorare le performance

## Slices

- [x] **S01: Implementare caching embedding** `risk:low` `depends:[]`
  > After this: Le query successive per lo stesso task vengono servite dal cache senza chiamate API

- [x] **S02: Migliorare qualità embedding con modello più accurato** `risk:medium` `depends:[]`
  > After this: Risultati di ricerca più pertinenti con embedding di qualità superiore

- [x] **S05: Perfezionamento Query Qdrant (Fase 1)** `risk:medium` `depends:[]`
  > After this: La ricerca restituisce massimo 5 chunk per documento sorgente con soglia di rilevanza >0.85, usando prefetch e group_by di Qdrant

- [x] **S06: Ottimizzazione Embedding (Fase 2)** `risk:high` `depends:[]`
  > After this: Nuovo embedding model produce risultati più pertinenti per codice sorgente

- [x] **S07: Re-ranking Risultati (Fase 3)** `risk:medium` `depends:[S06]`
  > After this: I risultati re-rankati privilegiano codice recente e percorsi relevanti

- [x] **S08: Cache Query e Normalizzazione (Fase 4)** `risk:low` `depends:[S05]`
  > After this: Query ripetute servite da cache in memoria senza chiamate Qdrant

## Boundary Map

Not provided.
