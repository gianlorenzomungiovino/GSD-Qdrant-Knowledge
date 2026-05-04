---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T03: Aggiungere boost per path matching nei risultati

Implementare il path boosting nella funzione di re-ranking: quando la query contiene pattern che corrispondono a percorsi di file.

Steps:
1. Nell'implementazione `applyRecencyBoost` in re-ranking.js, aggiungere logica di path matching
2. Estrarre le parole-chiave dalla query (tokenizzare)
3. Per ogni risultato code type, verificare se il path contiene almeno 1 token della query → +0.15 al score
4. Esempi: query 'implementare components' → boost a risultati con path contenente 'components/'
5. Mantenere boost separato da recency per debugging trasparente

Files likely touched: `src/re-ranking.js`
Verify: node src/cli.js context 'hooks post-commit' → post-commit.sh e .ps1 devono avere path match bonus

## Inputs

- `src/re-ranking.js`

## Expected Output

- `re-ranking.js contiene path boosting integrato`

## Verification

node src/cli.js context 'components auth' → verificare che risultati con src/components/ abbiano score più alto di altri file auth; log '[rerank] ... boost: %d (path match)', %d (recency)', count → conferma separato
