# S01: Implementazione tool auto_retrieve — UAT

**Milestone:** M002
**Written:** 2026-04-14T16:27:55.688Z

## Test del tool auto_retrieve

### Test 1: Task di autenticazione
- Input: 'implementiamo autenticazione JWT'
- Risultato: Estrae ['autenticazione'], genera query ['autenticazione']

### Test 2: Task di componente
- Input: 'creiamo un nuovo componente Hero'
- Risultato: Estrae ['componente', 'Hero'], genera query ['componente', 'componente Hero']

### Test 3: Task di API
- Input: 'implementiamo API per gestione utenti'
- Risultato: Estrae ['API'], genera query ['API']

### Verifica
- Tutte le funzioni esportate correttamente da src/gsd-qdrant-mcp/index.js
- Strumento MCP auto_retrieve disponibile e funzionante
- Ritorna metadata + contenuto completo per il top-1 risultato
