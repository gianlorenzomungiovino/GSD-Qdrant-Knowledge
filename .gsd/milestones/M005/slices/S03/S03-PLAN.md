# S03: Re-ranking Risultati (Fase 3)

**Goal:** Aggiungere campo lastModified al payload durante indicizzazione (lettura git), implementare re-ranking con boost recency (+0.05 se <30gg) e path matching, calcolare token estimation e troncare se >4000
**Demo:** I risultati re-rankati privilegiano codice recente e percorsi relevanti

## Must-Haves

- Not provided.

## Proof Level

- This slice proves: Not provided.

## Integration Closure

Not provided.

## Verification

- Not provided.

## Tasks

- [x] **T01: Aggiungere campo lastModified dal Git** `est:1.5h`
  Durante l'indicizzazione di documenti code type, leggere il timestamp git del file sorgente e aggiungerlo come `lastModified` nel payload Qdrant.

Steps:
1. Trovare la funzione di indicizzazione in index.js (classe GSDKnowledgeSync)
2. Prima di salvare, eseguire `git log -1 --format=%ct <filePath>` per timestamp unix
3. Aggiungere { lastModified: timestamp } al payload Qdrant
4. Fallback: se file non in git repo → lastModified = 0
5. Log: `console.log('[index] lastModified: %s, file: %s', ts, filePath);`

Files: index.js
Verify: verificare che ultimo documento indicizzato abbia campo lastModified nel payload
  - Files: `index.js`
  - Verify: node src/cli.js sync → verificare campo lastModified nel db Qdrant; confrontare con git log -1 --format=%ct <file>

- [x] **T02: Implementare re-ranking con boost recency** `est:2h`
  Creare funzione di re-ranking che aggiorna gli score Qdrant basandosi su lastModified.

Steps:
1. Creare `src/re-ranking.js` esportante `applyRecencyBoost(results, days=30)`
2. Per ogni risultato con lastModified > Date.now() - (days * 86400000) → score += 0.05
3. Cap max score a 1.0
4. Includere path matching nella stessa funzione: se query contiene parole del path → +0.15 al risultato
5. Log: `console.log('[rerank] %d results scored, avg boost: %.3f', count, avgBoost);`

Files: src/re-ranking.js (new), cli.js o gsd-qdrant-mcp (call site)
Verify: toccare file e verificare che la stessa query lo restituisca più in alto dopo re-ranking
  - Files: `src/re-ranking.js`
  - Verify: touch src/intent-detector.js; node src/cli.js context 'intent detector' → intent-detector dovrebbe apparire top 3 per recency

- [x] **T03: Aggiungere boost per path matching nei risultati** `est:1h`
  Implementare il path boosting nella funzione di re-ranking: quando la query contiene pattern che corrispondono a percorsi di file.

Steps:
1. Nell'implementazione applyRecencyBoost in re-ranking.js, aggiungere logica di path matching
2. Estrarre le parole-chiave dalla query (tokenizzare)
3. Per ogni risultato code type, verificare se il path contiene almeno 1 token della query → +0.15 al score
4. Esempi: query 'implementare components' → boost a risultati con path contenente 'components/'
5. Mantenere boost separato da recency per debugging trasparente

Files: src/re-ranking.js
Verify: 'hooks post-commit' → post-commit.sh e .ps1 devono avere path match bonus
  - Files: `src/re-ranking.js`
  - Verify: node src/cli.js context 'hooks post-commit'

- [x] **T04: Calcolare token estimation e troncare se >4000** `est:1.5h`
  Aggiungere stima dei token prima di restituire risultati a GSD/agent.

Steps:
1. Creare funzione `estimateTokens(text)` → ~4 char per token (approssimazione conservativa)
2. Dopo il re-ranking, calcolare somma totale dei chunk.text in caratteri
3. Se tokens > 4000 → troncamento: mantenere solo top K risultati e truncare text ai primi 500 chars
4. Log: `console.log('[retrieval] %d results, ~%d estimated tokens, trimmed to %d', ...)`
5. Integrare in gsd-qdrant-mcp/index.js come ultimo step prima del return

Files: src/gsd-qdrant-mcp/index.js, src/re-ranking.js (utility)
Verify: query che restituisce >4000 token → output ≤4000; query piccola → nessun troncamento
  - Files: `src/gsd-qdrant-mcp/index.js`
  - Verify: node src/cli.js context 'best practices web development' → verificare output ≤4000 token

## Files Likely Touched

- index.js
- src/re-ranking.js
- src/gsd-qdrant-mcp/index.js
