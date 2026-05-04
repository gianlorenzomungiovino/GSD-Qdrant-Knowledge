---
estimated_steps: 8
estimated_files: 1
skills_used: []
---

# T04: Includere percorso completo file nell'embedding

Aggiungere il path completo del file come prefix alla stringa di embedding.

Steps:
1. Trovare dove viene costruita la stringa di embedding per documents type=code
2. Prependere: `${filePath}\n---\n${content}` oppure formato simile
3. Verificare che il path sia incluso ma non domini l'embedding
4. Testare con query contenenti nomi di file specifici

Files: index.js (funzione buildCodeText)
Verify: 'src/hooks/post-commit.sh' → trova quel file specifico

## Inputs

- `index.js`

## Expected Output

- `Percorso file incluso come prefix nell'embedding`

## Verification

node src/cli.js context 'src/hooks/post-commit'
