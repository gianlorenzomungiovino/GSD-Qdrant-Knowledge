---
id: T03
parent: S01
milestone: M005
key_files:
  - src/cli.js — logging diagnostico dettagliato dei risultati raw prima del threshold filtering
duration: 
verification_result: passed
completed_at: 2026-04-27T14:35:00.000Z
blocker_discovered: false
---

# T03: Aggiungere logging diagnostico dettagliato per debugging retrieval quality

**Top-10 raw scores con source path, conteggio risultati a ciascuna soglia — utile per diagnosticare cutoff issues**

## What Happened

Analisi del logging in cli.js e gsd-qdrant-mcp/index.js: il logging esistente mostrava solo total_results e count above threshold. Non c'era visibilità sui singoli scores o sulle sorgenti dei primi risultati.

Modifica implementata:
1. Aggiunto logging top-10 raw scores con source path, project_id per debugging retrieval quality.
2. Conteggio risultati a ciascuna soglia (primary + fallback) per diagnosticare cutoff behavior.
3. Formato log strutturato: `[qdrant] auto_retrieve: total hits=N, threshold=X.XX, fallback_threshold=Y.YY`

Verifica: testata con 5 scenari unitari — query generiche, query specifiche, query senza risultati. Tutti producono output corretto senza errori.