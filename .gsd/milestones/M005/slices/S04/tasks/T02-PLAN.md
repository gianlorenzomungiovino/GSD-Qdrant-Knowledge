---
estimated_steps: 10
estimated_files: 1
skills_used: []
---

# T02: Normalizzazione query (lowercase + stopword removal)

Implementare normalizzazione della query prima del lookup in cache.

Steps:
1. Creare funzione normalizeQuery(query) in query-cache.js o modulo separato
2. Normalizzazione: lowercase → split → filtro stopwords → join
3. Stopwords inglesi: a, an, the, is, are, was, were, for, of, with, on, at, to, from, etc.
4. Stopwords italiane: il, lo, la, i, gli, le, un, uno, una, del, dello, della, dei, degli, delle, in, nel, nello, nella, nei, negli, nelle, etc.
5. Applicare prima del cache lookup: norm = normalizeQuery(original) → Cache.get(norm)
6. Log: `console.log('[cache] normalized: %s → %s', original, norm);`

Files: src/query-cache.js
Verify: 'Implementare Checkout' e 'implementare checkout' → stessa cache entry

## Inputs

- None specified.

## Expected Output

- `normalizeQuery() con EN+IT stopwords`

## Verification

node -e "test normalizeQuery('Implementare Checkout')" → stampa 'implementare checkout'
