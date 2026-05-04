# S01: Flat Search + Soglie (Fase 1) — UAT

**Milestone:** M005
**Written:** 2026-04-27T14:42:07.095Z

# UAT — S01: Flat Search + Soglie

## Precondizioni
- Server Qdrant in esecuzione con indice popolato
- Progetto GSD-Qdrant-Knowledge installato e funzionante

## Test Case 1: Flat search operativa
**Step:** `node src/cli.js context "come implementare checkout ecommerce"`
**Risultato atteso:** Output JSON con risultati, log `[qdrant] filter:` presente (nessun group_by)
**Risultato ottenuto:** ✅ Flat search attiva, risultati restituiti

## Test Case 2: Must filter su linguaggio certo
**Step:** `node src/cli.js context 'Node.js async pattern'`
**Risultato atteso:** Log `[qdrant] filter: must=1, should=0` (language=node applicato)
**Risultato ottenuto:** ✅ must=1, should=0

## Test Case 3: Flat search con LIMIT=30 e soglie abbassate
**Step:** `node src/cli.js context 'embedding model comparison'`
**Risultato atteso:** Fino a 30 candidati raw per re-ranking (prima group_by limitava a 2 chunk/doc)
**Risultato ottenuto:** ✅ Flat search operativa, LIMIT=30 configurato

## Test Case 4: Soglia primary ≥ 0.7 + fallback ≥ 0.55
**Step:** `node src/cli.js context 'tools for building web apps'`
**Risultato atteso:** Risultati con score ≥ 0.7 (primary), fallback a 0.55 se troppo pochi
**Risultato ottenuto:** ✅ Soglie applicate correttamente

## Test Case 5: Query ambigua senza filtri hard
**Step:** `node src/cli.js context 'implementare pattern architettura'`
**Risultato atteso:** Log `[qdrant] filter: must=0, should=0` (nessun filtro certo rilevato)
**Risultato ottenuto:** ✅ Ricerca vettoriale pura senza filtri

## Test Case 6: Regressione test unitari
**Step:** `npx vitest run src/intent-detector.test.js`
**Risultato atteso:** Tutti i test passano (27/27)
**Risultato ottenuto:** ✅ 27/27 passati in ~30ms

## Test Case 7: Compatibilità MCP server
**Step:** Verificare flat search e soglie in gsd-qdrant-mcp/index.js
**Risultato atteso:** Flat search con LIMIT=30, SCORE_THRESHOLD=0.7 presente nel codice MCP
**Risultato ottenuto:** ✅ grep conferma flat search operativa