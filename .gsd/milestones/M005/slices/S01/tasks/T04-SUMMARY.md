---
id: T04
parent: S01
milestone: M005
key_files:
  - src/cli.js — extractKeywords fallback integrato nella pipeline di ricerca
duration: 
verification_result: passed
completed_at: 2026-04-27T14:38:00.000Z
blocker_discovered: false
---

# T04: Integrare extractKeywords come safety net per query non-filtered

**extractKeywords() tokenizza e filtra stopwords EN/IT — la normalizzazione primaria è fatta dall'LLM via KNOWLEDGE.md**

## What Happened

Analisi della pipeline di ricerca in cli.js: le query venivano passate direttamente a embedText senza preprocessing. Questo funzionava bene quando l'LLM filtrava correttamente, ma non c'era un fallback per query non-filtered.

Modifica implementata:
1. extractKeywords() è stato integrato come primo step nella pipeline di ricerca CLI (dopo intent detection).
2. La funzione tokenizza la query, filtra stopwords EN (~60) + IT (~75), e restituisce i token significativi concatenati.
3. Se non ci sono token significativi, ritorna empty string → fallback alla query originale.

Verifica: testata con 8 scenari unitari — query italiane, query inglesi, solo stopwords, codice specifico. Tutti producono output corretto senza errori.