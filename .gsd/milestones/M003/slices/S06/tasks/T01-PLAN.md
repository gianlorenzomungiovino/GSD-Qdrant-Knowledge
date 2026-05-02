---
estimated_steps: 9
estimated_files: 2
skills_used: []
---

# T01: Sostituire modello embedding con codebert/unixcoder

Rimuovere all-MiniLM-L6-v2 e integrare un embedding model più adatto al codice sorgente.

Steps:
1. Verificare quali modelli sono disponibili localmente: ollama list
2. Valutare codebert (Microsoft) vs unixcoder (NVIDIA) per qualità codice → scegliere codebert
3. Integrare l'embedding tramite `@xenova/transformers` o embedding model locale
4. Se xenova non è in package.json, valutarne l'aggiunta come dipendenza leggera
5. Testare embedding su snippet di codice e confrontare con MiniLM esistente

Files likely touched: `index.js`, `package.json`
Verify: verificare che il modello si carichi senza errore

## Inputs

- `index.js`
- `package.json`
- `src/gsd-qdrant-mcp/index.js`

## Expected Output

- `Nuovo embedding model integrato in index.js`

## Verification

node -e "const { pipeline } = require('@xenova/transformers'); console.log('pipeline loaded');"; ollama run codebert --test (se Ollama locale)
