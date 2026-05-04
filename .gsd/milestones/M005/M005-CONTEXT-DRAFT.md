# M005 Context Draft — Ottimizzazione Retrieval e Performance

Fonte: FUTURE.md (piano analitico redatto dall'utente)

## Contesto

Il tool `gsd-qdrant-knowledge` (v2.2.2) ha un core funzionante con hybrid search (vector cosine + lexical TF-lite) che raggiunge >90% di precisione. Durante il retrieving automatico (hook `auto_retrieve`), vengono restituiti troppi caratteri (decine di migliaia) che l'LLM deve processare, aumentando il consumo di token.

## Problemi

1. Ricerca su Qdrant grossolana: limit 10 senza raggruppamento
2. LLM fa step aggiuntivi con find e auto_retrieve per trovare ciò che serve
3. Dovrebbe avvenire il contrario: ricerca iniziale mirata → solo dopo approfondire

## File rilevanti

- `src/intent-detector.js` — traduce query in intenzioni strutturate
- `src/context-analyzer.js` — analisi contestuale del progetto
- `index.js` (classe GSDKnowledgeSync) — indicizzazione e embedding
- `cli.js` — esegue la query su Qdrant con limit: 10
- `src/auto-retrieve-mcp.js` — hook MCP per retrieving automatico

## Pianificazione FUTURE.md mappata in 4 fasi → 4 slice

### Fase 1: Perfezionamento della query su Qdrant → S01

- T01: Modificare la funzione di ricerca per usare `prefetch` di Qdrant invece di `search` singola
- T02: Convertire i filtri di `intent-detector` da `should` a `must` quando l'intento è certo (tipo, linguaggio, progetto)
- T03: Implementare `group_by` per restituire max 1-2 chunk per documento sorgente
- T04: Ridurre il `limit` da 10 a 5, con soglia di rilevanza >0.85

### Fase 2: Ottimizzazione dell'embedding → S02

- T01: Sostituire `all-MiniLM-L6-v2` con `codebert` o `unixcoder` (dimensione 768)
- T02: Aggiornare `embeddingDimensions` in `index.js` e nella collection Qdrant
- T03: Modificare `buildCodeText` per dare più peso a signature, exports, imports
- T04: Includere il percorso completo del file nella stringa di embedding

### Fase 3: Re-ranking dei risultati → S03 (dipende da S02)

- T01: Aggiungere campo `lastModified` nel payload durante l'indicizzazione (lettura da Git)
- T02: Implementare funzione di re-ranking che applica weight per recency (+0.05 se modificato <30gg)
- T03: Aggiungere boost per path matching (se query contiene "components", dai più peso a percorsi con `components/`)
- T04: Calcolare token estimation dei risultati prima di restituirli; se >4000, tronca ai top K

### Fase 4: Cache e normalizzazione query → S04 (dipende da S01)

- T01: Implementare cache in memoria (Map) con TTL di 5 minuti per query normalizzate
- T02: Aggiungere normalizzazione query (lowercase, remove stopwords italiane/inglesi)
- T03: Aggiungere boost per match esatto su `symbolNames` (+0.2)

## Vincoli tecnici

- Mantenere compatibilità con l'esistente MCP server (`gsd-qdrant-mcp`)
- Non introdurre nuove dipendenze esterne pesanti (evitare LLM esterni per filtraggio)
- Preservare la filosofia "zero config" – eventuali nuove configurazioni devono avere default sensati
- Testare ogni task con una query reale

## Bug noto fuori scope

Il bug dell'hanging verrà fixato separatamente. Non includerlo in questa pianificazione.
