---
estimated_steps: 9
estimated_files: 2
skills_used: []
---

# T01: Sostituire modello embedding con codebert/unixcoder

Rimuovere all-MiniLM-L6-v2 e integrare un embedding model più adatto al codice.

Steps:
1. Verificare modelli disponibili: ollama list
2. Valutare codebert vs unixcoder per qualità codice → scegliere codebert
3. Integrare embedding tramite @xenova/transformers o modello locale
4. Se xenova non è in package.json, valutarne l'aggiunta come dipendenza leggera
5. Testare embedding su snippet di codice

Files: index.js, package.json (forse)
Verify: verificare che il modello si carichi senza errore

## Inputs

- `index.js`
- `ollama list output`

## Expected Output

- `Nuovo embedding model integrato in index.js`

## Verification

node -e "test load embedding model" → senza errori
