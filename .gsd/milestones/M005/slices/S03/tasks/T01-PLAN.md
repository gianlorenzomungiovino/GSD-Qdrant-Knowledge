---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T01: Aggiungere campo lastModified dal Git

Durante l'indicizzazione di documenti code type, leggere il timestamp git del file sorgente e aggiungerlo come `lastModified` nel payload Qdrant.

Steps:
1. Trovare la funzione di indicizzazione in index.js (classe GSDKnowledgeSync)
2. Prima di salvare, eseguire `git log -1 --format=%ct <filePath>` per timestamp unix
3. Aggiungere { lastModified: timestamp } al payload Qdrant
4. Fallback: se file non in git repo → lastModified = 0
5. Log: `console.log('[index] lastModified: %s, file: %s', ts, filePath);`

Files: index.js
Verify: verificare che ultimo documento indicizzato abbia campo lastModified nel payload

## Inputs

- `index.js`
- `git log output`

## Expected Output

- `Ultimo documento indicizzato con campo lastModified`

## Verification

node src/cli.js sync → verificare campo lastModified nel db Qdrant; confrontare con git log -1 --format=%ct <file>
