# S02: Ottimizzazione Embedding (Fase 2) — UAT

**Milestone:** M005
**Written:** 2026-04-27T15:59:35.280Z

# UAT — S02: Ottimizzazione Embedding

## Scenario 1: CodeBERT sostituisce all-MiniLM-L6-v2
**Obiettivo:** Verificare che il sistema usi codebert-base con embedding a 768 dimensioni.

### Precondizioni
- Il progetto è configurato con VECTOR_NAME='codebert-768' e EMBEDDING_DIMENSIONS=768

### Steps
1. Eseguire `grep -r '384' src/ index.js` → risultato: 0 occorrenze
2. Eseguire `grep -r '768' src/` → risultato: ≥2 occorrenze (verificato: 7)
3. Eseguire `grep -rn 'all-MiniLM\|fast-all-minilm' --include='*.js' . | grep -v node_modules` → risultato: nessun match

### Atteso
- Nessun riferimento a all-MiniLM-L6-v2 o fast-all-minilm-l6-v2 nella codebase
- embeddingDimensions = 768 in tutti i file rilevanti (index.js, gsd-qdrant-template.js)
- VECTOR_NAME = 'codebert-768' in index.js, cli.js, gsd-qdrant-mcp/index.js

---

## Scenario 2: buildCodeText con path grezzo come prima linea
**Obiettivo:** Verificare che il percorso del file sia la prima linea nel testo di embedding.

### Precondizioni
- Funzione buildCodeText in index.js disponibile

### Steps
1. Chiamare `buildCodeText('src/middleware/auth.js', 'content...', { project: 'test', language: 'javascript', kindDetail: 'middleware', signatures: ['function authMiddleware(req, res, next)'], exports: ['export default authMiddleware'], imports: ['express'] })`
2. Verificare che la prima riga del risultato sia `src/middleware/auth.js` (senza prefisso 'path:')

### Atteso
- Prima linea = percorso grezzo del file
- Nessun "path:" prefix nell'output
- Tutti gli altri metadata presenti dopo il path

---

## Scenario 3: Weighted header per structural elements nel template
**Obiettivo:** Verificare che buildCodeText in gsd-qdrant-template.js pre-pendi signatures/exports/imports come header strutturato.

### Precondizioni
- Funzione buildCodeText in src/gsd-qdrant-template.js disponibile

### Steps
1. Chiamare `buildCodeText` con payload contenente signatures, exports e imports non vuoti
2. Verificare che l'output inizi con un blocco SIGNATURES: contenente le firme, gli export e gli import
3. Chiamare `buildCodeText` con payload vuoto (tutte le array vuote) → verificare assenza di header "SIGNATURES:" vuoto

### Atteso
- Con payload ricco: output inizia con SIGNATURES:, seguito da signatures/exports/imports strutturati
- Con payload vuoto: nessun header SIGNATURES: presente, solo metadata e body
- Header troncatto a 2000 char se necessario
- Body limitato a 4000 char

---

## Scenario 4: Embedding dimension matching con Qdrant
**Obiettivo:** Verificare che non ci siano mismatch dimensionali tra embedding generati e collection Qdrant.

### Precondizioni
- index.js definisce embeddingDimensions = 768
- gsd-qdrant-template.js definisce embeddingDimensions = 768
- gsd-qdrant-mcp/index.js usa named vector con size: 768 per codebert-768

### Steps
1. Verificare che tutti i file usino lo stesso valore di embeddingDimensions (768)
2. Verificare che la definizione della collection Qdrant usi vectors: { [vectorName]: { size: 768, distance: 'Cosine' } }

### Atteso
- Nessun mismatch dimensionale possibile tra moduli
- Dimensione consistente in index.js, gsd-qdrant-template.js e gsd-qdrant-mcp/index.js
