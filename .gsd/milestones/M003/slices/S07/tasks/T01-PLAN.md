---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T01: Aggiungere campo lastModified dal Git

Durante l'indicizzazione di documenti code type, leggere il timestamp git del file sorgente e aggiungerlo come `lastModified` nel payload Qdrant.

Steps:
1. Trovare la funzione di indicizzazione in index.js (classe GSDKnowledgeSync o equivalente)
2. Prima di salvare il documento in Qdrant, eseguire `git log -1 --format=%ct <filePath>` per ottenere timestamp unix
3. Aggiungere `{ lastModified: timestamp }` al payload del documento Qdrant
4. Gestire graceful fallback: se file non in git repo → lastModified = 0 (nessun boost recency)
5. Log: `console.log('[index] lastModified: %s, file: %s', ts, filePath);`

Files likely touched: `index.js`
Verify: verificare che ultimo documento indicizzato abbia campo lastModified nel payload

## Inputs

- `index.js`

## Expected Output

- `Ultimo documento indicizzato con campo lastModified`

## Verification

node src/cli.js sync → verificare nel db Qdrant che documenti type=code abbiano lastModified; git log -1 --format=%ct <file> e confrontare valore
