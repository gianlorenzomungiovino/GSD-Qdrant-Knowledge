---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T03: Aggiungere boost per match esatto su symbolNames

Implementare il boost +0.2 per risultati che contengono match esatti sui nomi di simboli presenti nella query.

Steps:
1. Dopo la normalizzazione della query, estrarre i token (parole chiave)
2. Per ogni risultato Qdrant con campo `symbolNames` nel payload: verificare se almeno uno symbolName contiene un token della query (match esatto o substring)
3. Se match trovato → score *= 1.5 (boost ≈ +0.2 per range normalizzato [0,1])
4. Integrare in gsd-qdrant-mcp/index.js come passo dopo re-ranking ma prima di troncamento
5. Log: `console.log('[cache] symbolBoost: %d results', boostedCount);`

Files likely touched: `src/gsd-qdrant-mcp/index.js` (punto integrazione), eventualmente `src/re-ranking.js` per riutilizzare logica
Verify: node src/cli.js context 'buildCodeText' → risultati con buildCodeText in symbolNames devono avere score più alto di altri file

## Inputs

- None specified.

## Expected Output

- `Symbol boost +0.2 integrato in pipeline di retrieval`

## Verification

node src/cli.js context 'buildCodeText' → verificare che risultato principale contenga buildCodeText; console.log conferma '[cache] symbolBoost: N results'
