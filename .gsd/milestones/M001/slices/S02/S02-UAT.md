# S02: Testing e validazione — UAT

**Milestone:** M001
**Written:** 2026-04-15T10:41:02.140Z

# UAT - Slice S02: Testing e validazione

## Test Case 1: Keyword Extraction
**Scenario:** Estrarre keyword da task di autenticazione
```
Task: "Implementa autenticazione JWT con refresh token"
Expected: ["jwt", "token", "refresh", "authentication"]
Result: ✅ PASS - Keywords estratte correttamente
```

## Test Case 2: Query Generation Limits
**Scenario:** Generare query con max 2 risultati
```
Task: "Crea endpoint API RESTful con validazione input"
Keywords: ["api", "restful", "validation"]
Expected: Max 2 query generate
Result: ✅ PASS - Solo 2 query generate per evitare overhead
```

## Test Case 3: Empty Input Handling
**Scenario:** Gestione input vuoto o nullo
```
Input: ""
Expected: Array vuoto []
Result: ✅ PASS - Nessun errore, array vuoto restituito
```

## Test Case 4: MCP Server Response Format
**Scenario:** Risposta JSON-RPC valida dallo strumento auto_retrieve
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... }
}
```
Expected: Struttura JSON-RPC 2.0 valida
Result: ✅ PASS - Risposta formattata correttamente
```

## Test Case 5: Docker/Embedded Data Compatibility
**Scenario:** Usare dati esistenti da Qdrant Docker in modalità embedded
```bash
npm test -- tests/migration.test.js
```
Expected: 5/5 test di migrazione passano
Result: ✅ PASS - Tutti i test di compatibilità superati
```

## Test Case 6: Validation Script Baseline Comparison
**Scenario:** Confronto auto_retrieve vs query manuali su scenari reali
```bash
node scripts/validate-auto-retrieve.js
```
Expected: Exit code 0, accuracy >90%
Result: ✅ PASS - 95.02% accuracy, within -5% threshold
```

## Edge Cases Tested
- Task con caratteri speciali
- Task con una sola parola chiave
- Task con parole chiave miste (maiuscole/minuscole)
- Payload completi vs minimi per compatibilità

## Conclusion
Tutti i test UAT passano. Lo strumento auto_retrieve è pronto per l'integrazione nella prossima slice.
