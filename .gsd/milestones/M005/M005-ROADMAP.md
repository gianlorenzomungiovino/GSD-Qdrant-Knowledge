# M005: Ottimizzazione Retrieval e Performance

**Vision:** Ridurre il consumo di token durante il retrieving automatico migliorando la precisione della ricerca Qdrant (flat search + re-ranking), ottimizzando gli embedding con bge-m3 multilingue, implementando re-ranking basato su metadata Git e cache query in memoria. Target: risultati più pertinenti in meno caratteri, zero nuove dipendenze esterne pesanti.

## Slices

- [x] **S01: Flat Search + Soglie** `risk:medium` `depends:[]`
  > After this: La ricerca flat restituisce fino a 30 candidati con soglia di rilevanza ≥0.7, fallback a 0.55

- [x] **S02: Embedding bge-m3 Multilingue** `risk:high` `depends:[]`
  > After this: Nuovo embedding model multilingue (1024 dim) produce risultati più pertinenti per codice sorgente e query non-English

- [x] **S03: Re-ranking Risultati** `risk:medium` `depends:[]`
  > After this: I risultati re-rankati privilegiano codice recente e percorsi relevanti

- [x] **S04: Cache Query e Normalizzazione** `risk:low` `depends:[]`
  > After this: Query ripetute servite da cache in memoria senza chiamate Qdrant

## Boundary Map

Not provided.