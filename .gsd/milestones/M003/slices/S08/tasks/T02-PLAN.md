---
estimated_steps: 16
estimated_files: 1
skills_used: []
---

# T02: Normalizzazione query (lowercase + stopword removal)

Implementare normalizzazione della query prima del lookup in cache.

Steps:
1. Creare funzione `normalizeQuery(query)` nella stessa query-cache.js o modulo separato
2. Normalizzazione: lowercase → split → filtro stopwords → join
3. Stopwords inglesi definite (a, an, the, is, are, was, were, for, of, with, on, at, to, from):
   ```js
   const EN_STOPWORDS = new Set(['a','an','the','is','are','was','were','for','of','with','on','at','to','from']);
   ```
4. Stopwords italiane definite:
   ```js
   const IT_STOPWORDS = new Set(['il','lo','la','i','gli','le','un','uno','una','del','dello','della','dei','degli','delle','in','nel','nello','nella','nei','negli','nelle']);
   ```
5. Applicare prima del cache lookup: `const norm = normalizeQuery(original)` → `Cache.get(norm)`
6. Log: `console.log('[cache] normalized: %s → %s', original, norm);`

Files likely touched: `src/query-cache.js`
Verify: 'Implementare Checkout' e 'implementare checkout' devono restituire stessa cache entry

## Inputs

- None specified.

## Expected Output

- `normalizeQuery() in query-cache.js con EN+IT stopwords`

## Verification

node -e "const { normalizeQuery } = require('./src/query-cache'); console.log(normalizeQuery('Implementare Checkout'));" → deve stampare 'implementare checkout'; test multipli con stopwords italiane
