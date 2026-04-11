# S03: Fix indicizzazione completa

**Goal:** Correggere il bug di indicizzazione che salva SOLO file .md. Estendere a TUTTI i file sorgente.

**Demo:** After this: Tutti i file sorgente (.js, .ts, .sql, ecc.) vengono indicizzati e recuperati

## Slice Planning

### Success Criteria
- [x] Tutti i file sorgente vengono indicizzati (non solo .md)
- [x] La lista hardcoded di componenti viene rimossa
- [x] Le collection Qdrant vengono create automaticamente se non esistono
- [x] Il codice viene contestualizzato con i file .md durante il retrieving
- [x] I test verificano che snippet di codice vengano salvati e recuperati correttamente
- [x] Il post-commit hook triggera il sync automatico ad ogni commit
- [x] Le collection usano nomi dinamici basati sul nome del progetto

### Proof Level
**High** - Il sistema deve indicizzare e recuperare codice sorgente reale

### Integration Closure
Il sistema di indicizzazione deve integrarsi con il sistema di retrieving esistente

### Observability Impact
Il watcher deve monitorare tutti i file sorgente, non solo .md e componenti hardcoded

### Threat Surface (Q3)
| Scenario | Rischio | Mitigazione |
|----------|---------|-------------|
| File di codice con dati sensibili (password, API keys) | Esposizione di segreti | Ignorare file che contengono pattern di segreti (es: `.env`, `.pem`) |
| File troppo grandi (>100KB) | Memory overflow, timeout | Limitare dimensione massima, log warning |
| Indirizzi di rete non sicuri | Connettività a server non autorizzati | Validare URL Qdrant, usare solo localhost o URL configurati |

### Requirement Impact (Q4)
| Requirement | Status | Azione |
|-------------|--------|--------|
| R001 (Install globale) | No change | Nessuna modifica necessaria |
| R010 (Publish npm) | No change | Nessuna modifica necessaria |
| R009 (Documentazione) | Update needed | Aggiornare README con indicizzazione completa |

### Decisions to Reconsider
- **D012:** npm pkg fix - Confermare che package.json sia corretto prima di publish
- **D011:** Secure token storage - Confermare che il token npm sia sicuro

---

## Tasks

### T01: Analisi del sistema di indicizzazione attuale
**Est:** 2h

**Why:** Verificare che il sistema indichi già tutti i file sorgente (non solo .md) e identificare eventuali limitazioni.

**Files:**
- `gsd-qdrant/index.js` (file principale di indicizzazione)

**Do:**
1. Leggere `gsd-qdrant/index.js` e verificare:
   - La logica di `walkGsd()` che indica i file `.md` di `.gsd/`
   - La logica di `walkProjectCode()` che indica i file sorgente del progetto
   - I set `CODE_EXTENSIONS` e `EXCLUDED_FILE_EXTENSIONS`
   - Come vengono create le collection (usano `${projectName}-docs` e `${projectName}-snippets`)
2. Verificare che il post-commit hook esista e funzioni correttamente
3. Identificare eventuali miglioramenti necessari

**Verify:**
```bash
grep -n "CODE_EXTENSIONS\|EXCLUDED_FILE_EXTENSIONS" gsd-qdrant/index.js
grep -n "walkGsd\|walkProjectCode" gsd-qdrant/index.js
```

**Done when:**
- Documentazione completa dello stato attuale
- Eventuali problemi identificati e pianificati

---

### T02: Verificare che l'indicizzazione esista per tutti i file sorgente
**Est:** 3h

**Why:** Il sistema attuale usa già `walkProjectCode()` che indica tutti i file sorgente del progetto (non solo `.md`). Dobbiamo verificare che funzioni correttamente.

**Files:**
- `gsd-qdrant/index.js`

**Do:**
1. Verificare che `CODE_EXTENSIONS` contenga tutte le estensioni necessarie:
   ```javascript
   const CODE_EXTENSIONS = new Set([
     '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',  // JavaScript/TypeScript
     '.py', '.rb', '.php', '.go', '.rs', '.java', '.kt', '.scala', '.cs',  // Altri linguaggi
     '.html', '.css', '.scss', '.sass', '.less',  // Frontend
     '.sql', '.sh', '.bash', '.zsh', '.ps1',  // Script
     '.json', '.yaml', '.yml', '.toml', '.xml',  // Config
     '.swift', '.dart', '.vue', '.svelte', '.astro'  // Moderne
   ]);
   ```
2. Verificare che `EXCLUDED_FILE_EXTENSIONS` escluda solo i file non rilevanti (`.md`, immagini, ecc.)
3. Eseguire un test di indicizzazione e verificare che tutti i file sorgente vengano indicizzati

**Verify:**
```bash
node scripts/sync-knowledge.js 2>&1 | grep "Snippets:"
```

**Must-haves:**
- Tutti i file `.js`, `.ts`, `.py`, `.sql` ecc. vengano indicizzati
- Il sistema usi collection dinamiche basate sul nome del progetto

**Done when:**
- L'indicizzazione esiste per tutti i file sorgente
- Il sistema usa collection dinamiche (`qdrant-template-docs`, `qdrant-template-snippets`)

---

### T03: Verificare che il post-commit hook funzioni correttamente
**Est:** 2h

**Why:** Il post-commit hook deve triggerare il sync automatico ad ogni commit locale.

**Files:**
- `.git/hooks/post-commit`

**Do:**
1. Verificare che il post-commit hook esista e sia eseguibile:
   ```bash
   ls -la .git/hooks/post-commit
   ```
2. Controllare che il contenuto sia corretto:
   ```bash
   cat .git/hooks/post-commit
   ```
3. Testare che il hook venga eseguito ad ogni commit:
   ```bash
   echo "test" >> test.txt && git add test.txt && git commit -m "test"
   ```
4. Verificare che il sync venga eseguito automaticamente (output `✅ Knowledge synced`)
5. Pulire i file di test dopo il verification

**Verify:**
```bash
# Dopo un commit, dovrebbe vedere:
# ✅ Knowledge synced
```

**Must-haves:**
- Il post-commit hook esiste ed è eseguibile
- Il hook esegue `node scripts/sync-knowledge.js` dalla root del progetto
- Il sync viene eseguito automaticamente ad ogni commit locale

**Done when:**
- Il post-commit hook triggera il sync automatico ad ogni commit
- Nessun file di test rimane nel repository

---

### T04: Verificare che le collection siano create dinamicamente
**Est:** 2h

**Why:** Il sistema usa già collection dinamiche basate sul nome del progetto (`${projectName}-docs`, `${projectName}-snippets`). Dobbiamo verificare che funzioni correttamente.

**Files:**
- `gsd-qdrant/index.js`

**Do:**
1. Verificare che le collection vengano create dinamicamente:
   ```javascript
   this.projectName = basename(PROJECT_ROOT);
   this.collections = {
     docs: `${this.projectName}-docs`,
     snippets: `${this.projectName}-snippets`,
   };
   ```
2. Verificare che `ensureCollection()` crei le collection se non esistono
3. Verificare che le collection esistano:
   ```bash
   node -e "const { GSDKnowledgeSync } = require('./gsd-qdrant'); const s = new GSDKnowledgeSync(); s.init().then(async () => { const c = await s.client.getCollections(); console.log(c.collections.map(x => x.name).join(', ')); });"
   ```
4. Verificare che le collection abbiano i named vectors corretti

**Verify:**
```bash
node -e "const { GSDKnowledgeSync } = require('./gsd-qdrant'); const s = new GSDKnowledgeSync(); s.init().then(async () => { const c = await s.client.getCollections(); console.log(c.collections.map(x => x.name).join(', ')); });"
```

**Must-haves:**
- Le collection usano nomi dinamici basati sul nome del progetto
- Le collection vengono create automaticamente se non esistono
- Le collection hanno named vectors con il nome corretto

**Done when:**
- Le collection sono create dinamicamente con nomi corretti
- Il sistema funziona senza Qdrant pre-esistente (crea le collection automaticamente)

---

### T05: Verificare che il retrieving includa già il contesto
**Est:** 3h

**Why:** Il sistema usa già `findRelevantDocsForSnippet()` per collegare snippet ai file `.md` di `.gsd/`. Dobbiamo verificare che funzioni correttamente.

**Files:**
- `gsd-qdrant/index.js`
- `scripts/cli.js`

**Do:**
1. Verificare che `findRelevantDocsForSnippet()` esista e sia chiamato durante l'indicizzazione:
   ```javascript
   const contextRefs = this.findRelevantDocsForSnippet(relPath, content, docIndex);
   ```
2. Verificare che il campo `relatedDocs` sia incluso nei payload degli snippet:
   ```javascript
   relatedDocs: contextRefs.map((doc) => ({ path: doc.path, title: doc.title || basename(doc.path), ids: doc.ids, reason: doc.reason })),
   relatedDocPaths: contextRefs.map((doc) => doc.path),
   relatedDocIds: [...new Set(contextRefs.flatMap((doc) => doc.ids))],
   ```
3. Verificare che `searchWithContext()` restituisca già il contesto quando richiesto:
   ```javascript
   if (!options.withContext) return snippetHits.map((hit) => ({ score: hit.score, ...hit.payload }));
   // ... altrimenti include il contesto
   ```
4. Testare che il flag `--context` funzioni in `scripts/cli.js` snippet search

**Verify:**
```bash
node scripts/cli.js snippet search "docker" --context
```

**Must-haves:**
- Gli snippet hanno già i campi `relatedDocs`, `relatedDocPaths`, `relatedDocIds`
- Il retrieving include il contesto quando richiesto con `--context`
- Il flag `--context` funziona in `scripts/cli.js snippet search`

**Done when:**
- Il retrieving include già il contesto dagli file `.md` di `.gsd/`
- Il flag `--context` funziona correttamente in `scripts/cli.js snippet search`

---

### T06: Verificare che l'indicizzazione sia già incrementale
**Est:** 2h

**Why:** Il sistema usa già un approccio incrementale basato su hash. Dobbiamo verificare che funzioni correttamente.

**Files:**
- `gsd-qdrant/index.js`

**Do:**
1. Verificare che l'indicizzazione sia già incrementale:
   ```javascript
   const hash = this.hashContent(content);
   seenIds.add(String(id));
   if (docsState[id]?.hash === hash) continue;  // Salta file non modificati
   ```
2. Verificare che vengano cancellati automaticamente i file rimossi dal progetto:
   ```javascript
   const deleted = await this.deleteMissingPoints(this.collections.docs, docsState, seenIds);
   ```
3. Testare che solo i file modificati vengano processati:
   ```bash
   # Modifica un file .md
   echo "test" >> .gsd/README.md
   node scripts/sync-knowledge.js 2>&1 | grep "Docs:"
   ```
4. Verificare che i file rimossi vengano cancellati dalle collection:
   ```bash
   rm .gsd/test-indexing.md
   node scripts/sync-knowledge.js 2>&1 | grep "deleted"
   ```

**Verify:**
```bash
# Dopo un sync, dovrebbe vedere:
# ✅ Updated X, deleted Y
```

**Must-haves:**
- Solo i file modificati vengono processati (basato su hash)
- I file rimossi vengono cancellati automaticamente dalle collection
- Il logging mostra il numero di file aggiornati e cancellati

**Done when:**
- L'indicizzazione è incrementale (solo file modificati)
- I file rimossi vengono cancellati automaticamente dalle collection
- Il logging mostra il progresso dell'indicizzazione (updated/deleted counts)

---

### T07: Verifica end-to-end del sistema di indicizzazione
**Est:** 4h

**Why:** Testare il sistema completo per verificare che tutti i file sorgente vengano indicizzati, salvati e recuperati correttamente.

**Files:**
- `gsd-qdrant/index.js`
- `scripts/sync-knowledge.js`

**Do:**
1. Creare file di test (`.js`, `.ts`, `.sql`) fuori dal repository:
   ```bash
   mkdir -p test-temp
   cat > test-temp/test-snippet.js << 'EOF'
   const testFunction = (data) => data.map(i => i.toUpperCase());
   module.exports = { testFunction };
   EOF
   ```
2. Eseguire `sync` e verificare che vengano indicizzati:
   ```bash
   node scripts/sync-knowledge.js 2>&1 | grep "Snippets:"
   ```
3. Fare query per verificare il recupero:
   ```bash
   node scripts/cli.js snippet search "test function" | head -20
   ```
4. Verificare che il contesto venga incluso con `--context`:
   ```bash
   node scripts/cli.js snippet search "docker" --context | head -30
   ```
5. Pulire i file di test dopo il verification:
   ```bash
   rm -rf test-temp/
   ```

**Verify:**
```bash
# Dopo un sync, dovrebbe vedere:
# 🔧 Snippets: X files
# ✅ Updated Y, deleted Z

# Dopo una search, dovrebbe vedere almeno 1 risultato:
# 📊 Snippet Ranking Module
# Query: "test function"
# Found X results:
```

**Must-haves:**
- I file sorgente `.js`, `.ts`, `.sql` vengano indicizzati correttamente
- Gli snippet vengano recuperati correttamente dalla search
- Il contesto venga incluso correttamente con `--context`

**Done when:**
- Tutti i file sorgente vengono indicizzati e recuperati correttamente
- Il contesto viene incluso correttamente
- Nessun file di test rimane nel repository

---

## Notes for Executors

**Priority:** HIGH - This work blocks the complete functionality of the CLI

**Key Files:**
- `gsd-qdrant/index.js` (file principale di indicizzazione e retrieving)
- `scripts/sync-knowledge.js` (script di invocazione)
- `scripts/cli.js` (CLI per snippet search/apply)
- `.git/hooks/post-commit` (hook per sync automatico)

**Files to Clean:**
- Rimuovere eventuali file di test creati durante la verifica

**Testing:**
- Test con file reali (`.js`, `.ts`, `.sql`)
- Verificare che il post-commit hook triggeri il sync automatico
- Verificare che il retrieving includa il contesto con `--context`

**Do NOT:**
- Modificare la logica di intent detection (già implementata in S01)
- Modificare la logica di snippet apply (già implementata in S02)
- Aggiungere nuove feature - concentrarsi solo sulla verifica dell'indicizzazione esistente
