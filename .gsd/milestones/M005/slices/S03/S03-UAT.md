# S03: Re-ranking Risultati (Fase 3) — UAT

**Milestone:** M005
**Written:** 2026-04-27T17:05:04.913Z

# UAT — Slice S03: Re-ranking Risultati

## Precondizioni
- Qdrant server in esecuzione con collezione `gsd_memory` popolata
- File indicizzati con campo `lastModified` nel payload (richiede sync post-T01)

## Test Case 1: Recency boost per file recenti (<30 giorni)
**Passo:** Esegui query su un file modificato recentemente  
**Attesa:** Il risultato riceve +0.05 di boost allo score rispetto a risultati non recent  
**Verifica:** `applyRecencyBoost()` con lastModified = Date.now() - 86400*5 → score aumenta di 0.05

## Test Case 2: Path matching (+0.15) quando query words corrispondono al percorso
**Passo:** Query 'intent detector' su file src/intent-detector.js  
**Attesa:** Score +0.05 (recency) + +0.15 (pathMatch) = +0.20 totale, risultato in top 3  
**Verifica:** intent-detector.js sale da 0.72 a 0.92 e ranks #1

## Test Case 3: Score cap a 1.0
**Passo:** Query su file recente con pathMatch che ha score base 0.98  
**Attesa:** Score finale = 1.0 (non supera il massimo)  
**Verifica:** Math.min(1.0, 0.98 + 0.20) = 1.0

## Test Case 4: File vecchi (>30 giorni) non ricevono recency boost
**Passo:** Query su file con lastModified = Date.now() - 86400*365  
**Attesa:** Score rimane invariato (nessun +0.05), solo pathMatch se applicabile  
**Verifica:** score base mantenuto, avg boost logging corretto

## Test Case 5: Token estimation corretta
**Passo:** estimateTokens('hello world')  
**Attesa:** ceil(11/4) = 3 tokens  
**Verifica:** valore esatto restituito

## Test Case 6: Troncamento quando >4000 token totali
**Passo:** Query che ritorna risultati con ~4500 token totali  
**Attesa:** Ogni campo text/content/summary truncato a max 500 chars, log '[retrieval] ... trimmed to 500 chars per result'  
**Verifica:** content.length ≤ 500 dopo trimResultsByTokenBudget

## Test Case 7: Risultati piccoli passano senza troncamento
**Passo:** Query che ritorna risultati con ~114 token totali  
**Attesa:** Nessun truncamento, contenuto originale preservato  
**Verifica:** content === 'short' (invariato) dopo trim

## Test Case 8: Edge cases — input null/empty safe
**Passo:** applyRecencyBoost(null), estimateTokens(null), trimResultsByTokenBudget([])  
**Attesa:** Nessuna eccezione, ritorno silenzioso o array vuoto  
**Verifica:** nessun crash, funzioni returnano valori attesi

## Test Case 9: Custom days parameter (number e object form)
**Passo:** applyRecencyBoost(results, 7) e applyRecencyBoost(results, {days: 7})  
**Attesa:** File a 2 giorni riceve boost in entrambi i formati  
**Verifica:** score = base + 0.05 per entrambi

## Test Case 10: pathMatch disabled
**Passo:** applyRecencyBoost(results, {pathMatch: false})  
**Attesa:** Solo recency applicato, nessun +0.15 per path matching  
**Verifica:** boost totale = 0.05 (non 0.20)

## Test Case 11: Short query (<3 chars) skip pathMatch
**Passo:** Query 'ab' su file con source contenente 'ab'  
**Attesa:** Nessun pathMatch bonus, solo recency se applicabile  
**Verifica:** boost = 0.05 (non 0.20)

## Test Case 12: Missing lastModified handled gracefully
**Passo:** Risultato senza campo lastModified nel payload  
**Attesa:** Nessun crash, score non modificato da recency  
**Verifica:** score rimane base value
