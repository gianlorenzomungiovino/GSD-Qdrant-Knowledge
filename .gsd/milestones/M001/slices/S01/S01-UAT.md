# S01: Implementare strumento auto_retrieve — UAT

**Milestone:** M001
**Written:** 2026-04-15T08:48:19.267Z

# UAT - Slice S01: Strumento auto_retrieve

## Test Case 1: Keyword extraction da task semplice
**Precondition:** MCP server GSD-Qdrant in esecuzione

**Steps:**
1. Chiama lo strumento `auto_retrieve` con task: 'implementiamo autenticazione JWT'
2. Verifica che la risposta contenga keyword estratte

**Expected:**
- Response con JSON strutturato
- Almeno 1 keyword estratta (es: 'autenticazione')
- Query generate basate sulle keyword
- Risultati di ricerca restituiti

---

## Test Case 2: Keyword extraction multipla
**Precondition:** MCP server GSD-Qdrant in esecuzione

**Steps:**
1. Chiama lo strumento `auto_retrieve` con task: 'implementiamo autenticazione JWT e componenti React'
2. Verifica che vengano estratte multiple keyword

**Expected:**
- Response con JSON strutturato
- Almeno 2 keyword estratte (es: 'autenticazione', 'componenti')
- Max 2 query generate
- Risultati di ricerca restituiti

---

## Test Case 3: Parametro includeContent
**Precondition:** MCP server GSD-Qdrant in esecuzione, almeno 1 risultato disponibile

**Steps:**
1. Chiama lo strumento `auto_retrieve` con task: 'test keyword' e includeContent=true
2. Verifica che il primo risultato includa il contenuto completo

**Expected:**
- Response con JSON strutturato
- Risultato con index 0 include campo 'content' con valore non-null
- Risultati successivi non includono campo 'content'

---

## Test Case 4: Limitazione risultati
**Precondition:** MCP server GSD-Qdrant in esecuzione

**Steps:**
1. Chiama lo strumento `auto_retrieve` con task: 'test keyword' e limit=1
2. Verifica che venga restituito solo 1 risultato

**Expected:**
- Response con JSON strutturato
- Array results con esattamente 1 elemento

---

## Test Case 5: Matching analysis logging
**Precondition:** MCP server GSD-Qdrant in esecuzione

**Steps:**
1. Chiama lo strumento `auto_retrieve` con task: 'componente UI header footer'
2. Controlla i log in stderr

**Expected:**
- Log con prefisso '[GSD-Qdrant MCP]'
- Sezione 'Matching Analysis' con:
  - Vector matches count e avg score
  - Text matches count e avg score
  - Dominant match type (vector/text/balanced)
  - Percentuali per tipo di matching

---

## Test Case 6: Fallback per task senza keyword
**Precondition:** MCP server GSD-Qdrant in esecuzione

**Steps:**
1. Chiama lo strumento `auto_retrieve` con task: 'test generico senza keyword riconosciute'
2. Verifica che il sistema usi fallback

**Expected:**
- Response con JSON strutturato
- Query generate basate sul task intero (fallback)
- Risultati di ricerca restituiti

---

## Edge Cases

### EC1: Task vuoto
- **Steps:** Chiama `auto_retrieve` con task: ''
- **Expected:** Fallback al task intero, possibili errori di ricerca gestiti

### EC2: Task con solo stop words
- **Steps:** Chiama `auto_retrieve` con task: 'il e la un'
- **Expected:** Fallback al task intero, ricerca con query generica

### EC3: Query non trovata nel database
- **Steps:** Chiama `auto_retrieve` con task: 'keyword che non esistono assolutamente'
- **Expected:** Response con results array vuoto, totalFound=0

---

## Acceptance Criteria
- [ ] Tool auto_retrieve è esposto correttamente sul MCP server
- [ ] Keyword extraction funziona per categorie supportate
- [ ] Max 2 query generate indipendentemente dal numero di keyword
- [ ] Risultati ordinati per relevance_score decrescente
- [ ] IncludeContent funziona correttamente (solo primo risultato)
- [ ] Logging dettagliato del tipo di matching in stderr
- [ ] Error handling gestito correttamente (isError: true in response)
