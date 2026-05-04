---
estimated_steps: 11
estimated_files: 1
skills_used: []
---

# T04: Includere percorso completo file nell'embedding

Aggiungere il path completo del file come prefix alla stringa di embedding.

Steps:
1. Trovare dove viene costruita la stringa di embedding per i documenti type=code
2. Prependere il percorso completo: `${filePath}
---
${content}` oppure `${filePath}: ${sig}
${content}`
3. Testare che il path sia incluso ma non domini l'embedding (non troppo lungo)
4. Verificare con query che contengano nomi di file specifici

Files likely touched: `index.js` (funzione buildCodeText o equivalente)
Verify: node src/cli.js context 'src/hooks/post-commit.sh' → deve trovare quel file specifico

## Inputs

- `index.js`

## Expected Output

- `Percorso file incluso come prefix nella stringa di embedding`

## Verification

node src/cli.js context 'src/hooks/post-commit' → risultato contiene post-commit; verificare nel log il testo dell'embedding per conferma del path prefix
