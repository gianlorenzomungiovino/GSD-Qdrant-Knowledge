# Guida Utente GSD + Qdrant CLI

## Panoramica

Questa CLI automatizza la configurazione di GSD (Get Shit Done) con Qdrant database vettoriale in qualsiasi progetto Node.js.

## Caratteristiche Principali

### M001: CLI di Configurazione
- Installa automaticamente le dipendenze (`@qdrant/js-client-rest`, `@xenova/transformers`)
- Esegue il setup dal template
- Configura `.gsd/mcp.json` e `src/lib/gsd-qdrant-sync/index.js`
- Esegue la prima sincronizzazione della conoscenza

### M002: Testing e Pubblicazione
- 15 unit tests completati con Vitest
- Coverage testing per tutte le funzioni utility
- Script di test configurati

### M003: Database di Code Snippets
- Estrazione di snippet di codice (funzioni, classi, config) da file sorgente
- Archiviazione in database vettoriale con PostgreSQL + pgvector
- Ricerca semantica tramite embeddings
- Search API con scoring di rilevanza
- CLI command per cercare snippet tra progetti

---

## Installazione

### 1. Installa la CLI (una volta)

Dalla cartella del template:

```bash
npm install -g ./qdrant-template
```

Oppure installa globalmente da npm (quando pubblicato):

```bash
npm install -g gsd-qdrant-cli
```

### 2. Copia il template nel progetto target

```bash
# Copia la cartella qdrant-template nel tuo progetto
cp -r qdrant-template /tuo-progetto-target/
```

---

## Uso della CLI

### Configurazione di Base

```bash
cd /tuo-progetto-target
gsd-qdrant
```

Questo esegue:
1. Installa `@qdrant/js-client-rest` e `@xenova/transformers`
2. Esegue il setup dal template
3. Esegue la prima sincronizzazione della conoscenza

### Ricerca di Snippet di Codice

```bash
# Cerca snippet con una query
gsd-qdrant snippet search 'authentication'

# Cerca con filtri
gsd-qdrant snippet search 'database' --type=function --language=typescript

# Esporta risultati
gsd-qdrant snippet search 'api' --export=results.json
```

### Filtri Disponibili

- `--type` - Filtra per tipo (function, class, module, config, script)
- `--language` - Filtra per linguaggio (javascript, typescript)
- `--tags` - Filtra per tag (comma-separated)
- `--export` - Esporta risultati in file JSON

---

## Script Disponibili

### Scripts di Configurazione

| Script | Descrizione |
|--------|-------------|
| `scripts/cli.js` | CLI principale per configurare GSD + Qdrant |
| `scripts/bootstrap-project.js` | Bootstrap script che installa dipendenze e configura |
| `scripts/setup-from-templates.js` | Setup dal template di Qdrant |
| `scripts/install-dependencies.js` | Installa `@qdrant/js-client-rest` e `@xenova/transformers` |
| `scripts/sync-knowledge.js` | Esegue la sincronizzazione della conoscenza |

### Scripts di Snippets

| Script | Descrizione |
|--------|-------------|
| `scripts/snippet-db-schema.js` | Schema database per archiviazione snippet |
| `scripts/ast-parser.js` | Parser AST per estrarre codice |
| `scripts/snippet-extractor.js` | Estrae funzioni, classi, config da file sorgente |
| `scripts/snippet-storage.js` | Salva snippet con embeddings nel database |
| `scripts/search-api.js` | API di ricerca con scoring di rilevanza |
| `scripts/snippet-ranking.js` | Ranking e filtering per risultati di ricerca |

---

## Database Schema

### Tabelle Principali

```sql
-- Snippet core table
CREATE TABLE snippets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,              -- function, class, module, config, script
    name TEXT NOT NULL,
    language TEXT NOT NULL,          -- javascript, typescript
    sourceFile TEXT NOT NULL,
    sourceLine INTEGER NOT NULL,
    content TEXT NOT NULL,
    description TEXT,
    tags TEXT[],
    dependencies TEXT[],
    context TEXT,
    metrics JSONB,                    -- { lines, complexity, testCoverage }
    crossProject BOOLEAN DEFAULT false,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search indexes
CREATE INDEX idx_snippets_name_fts ON snippets USING gin(to_tsvector('english', name));
CREATE INDEX idx_snippets_description_fts ON snippets USING gin(to_tsvector('english', description));
CREATE INDEX idx_snippets_content_fts ON snippets USING gin(to_tsvector('english', content));

-- Vector search index (pgvector)
CREATE INDEX idx_snippets_embedding ON snippets USING vector(embedding_ops);

-- Cross-project reuse indexes
CREATE INDEX idx_snippets_cross_project ON snippets(crossProject);
CREATE INDEX idx_snippets_type ON snippets(type);
CREATE INDEX idx_snippets_language ON snippets(language);
```

---

## Unit Tests

### Esegui i Test

```bash
# Esegui tutti i test
npm test

# Esegui in watch mode
npm run test:watch

# Esegui con coverage report
npm run test:coverage
```

### Test Coverage

| File | Coverage |
|------|----------|
| `scripts/cli-utils.js` | 100% |
| `scripts/setup-utils.js` | 100% |
| `scripts/install-dependencies.js` | 100% |
| `scripts/sync-knowledge.js` | 100% |

---

## Struttura dei Milestone

### M001: CLI Creation and Testing ✅

**Obiettivo:** Creare CLI che automatizza GSD + Qdrant setup

**Completato:**
- CLI installa dipendenze prima di eseguire setup
- Testato in progetto di test
- Documentazione completa

### M002: Testing and Publishing ✅

**Obiettivo:** Aggiungere unit tests e preparare per pubblicazione

**Completato:**
- Vitest configurato con coverage
- 15 unit tests passati
- Utility functions estratte per testabilità
- Scripts di test creati

### M003: Code Snippets Database ✅

**Obiettivo:** Abilitare riutilizzo di codice tra progetti

**Completato:**
- Schema database PostgreSQL + pgvector
- Estrazione snippet con AST parser
- Archiviazione con embeddings
- Search API con relevance scoring
- CLI command per ricerca snippet

---

## Troubleshooting

### Problema: Error "Cannot find module"

**Soluzione:** La CLI installa automaticamente le dipendenze prima di eseguire il setup. Assicurati di usare `gsd-qdrant` invece di eseguire direttamente gli script di setup.

### Problema: Vector search non funziona

**Soluzione:** Assicurati che pgvector sia installato nel database PostgreSQL:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Problema: Search API non restituisce risultati

**Soluzione:**
1. Verifica che i snippet siano stati estratti e salvati
2. Controlla che gli embeddings siano stati generati
3. Verifica che il query matches con i contenuti dei snippet

---

## Stato Attuale

| Milestone | Status | Completato |
|-----------|--------|------------|
| M001: CLI Creation and Testing | ✅ Complete | 100% |
| M002: Testing and Publishing | ✅ Complete | 100% |
| M003: Code Snippets Database | ✅ Complete | 100% |

---

## Prossimi Passi

### M004: Global CLI Publish (Future)

- Pubblicare su npm (`gsd-qdrant-cli`)
- Aggiungere TypeScript support
- Aggiungere integration tests
- Aggiungere performance monitoring

### M005: Advanced Features (Future)

- Supporto per più linguaggi di programmazione
- Cache per snippet search
- Plugin system per extension
- UI web per snippet management

---

## Contributi

Per contribuire:
1. Fork il repository
2. Crea un branch per la feature
3. Esegui i test: `npm test`
4. Fai una pull request

---

## License

[Da definire]

---

## Author

GSD + Qdrant CLI Team

---

**Versione:** 1.0.0  
**Ultimo Aggiornamento:** Aprile 2026
