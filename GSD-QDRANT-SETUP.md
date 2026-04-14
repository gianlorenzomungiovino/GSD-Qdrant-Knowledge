# GSD-QDRANT-SETUP

Guida rapida al setup locale della CLI e di Qdrant.

## 1. Installa la CLI

Da npm:

```bash
npm install -g gsd-qdrant-cli
```

Oppure in locale dal repository:

```bash
npm install -g .
```

Verifica:

```bash
gsd-qdrant --version
```

## 2. Avvia Qdrant

```bash
docker run -d --name qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

## 3. Esegui il bootstrap nella root del progetto

```bash
gsd-qdrant
```

Il comando:
- crea `gsd-qdrant/`
- crea/valida la collection unificata `gsd_memory` (single collection per tutti i progetti)
- sincronizza `.gsd/` e il codice del progetto (tipo "doc" e tipo "code")

## 4. Verifica rapida

Collection presenti:

```bash
curl -s http://localhost:6333/collections
```

Collection unificata `gsd_memory`:

```bash
curl -s "http://localhost:6333/collections/gsd_memory/points/scroll" -H "Content-Type: application/json" -d '{"limit": 2}'
```

Verifica i punti indicizzati:
- Filtra per tipo `doc` → documenti `.gsd`
- Filtra per tipo `code` → codice progetto
- Usa il filtro `project_id` per query specifiche per progetto o cross-project

## 5. Search contestuale

```bash
gsd-qdrant context "query"              # Query contestuale con contesto ibrido
gsd-qdrant snippet search "component" --context  # Ricerca snippet con contesto
```

### Knowledge Sharing Nativo

Il modulo `scripts/knowledge-sharing.js` fornisce integrazione nativa per il knowledge sharing:

```javascript
// Includi il modulo nel tuo codice GSD
const knowledgeSharing = require('./scripts/gsd-knowledge-sharing');

// Inizializza
await knowledgeSharing.init();

// Usa come hook beforeMessage per retrieving automatico
api.on('beforeMessage', async (event, ctx) => {
  await knowledgeSharing.onBeforeMessage(event, ctx);
});

// Oppure genera prompt standalone
const prompt = await knowledgeSharing.buildPrompt(query, { limit: 10 });
```

## Stato del flusso (V2.0)

- il tool è project-wide
- non distingue più frontend/backend come flusso principale
- **Collection unificata `gsd_memory`**: singolo punto di indicizzazione per tutti i progetti
- **Type-based classification**: punti classificati come "doc" (documenti `.gsd`) o "code" (codice progetto)
- Il comando base evita reinstallazioni inutili quando le dipendenze minime sono già disponibili
- **Knowledge sharing nativo**: modulo `scripts/knowledge-sharing.js` per integrazione con GSD
- **Compatibilità Windows**: hook post-commit e path separatori supportano sia Windows che Linux
- **Cross-project insights**: sfrutta la collection unificata per conoscenze condivise tra progetti

## Versione

Versione di lavoro allineata: `2.0.0` (V2.0 - Unified Collection Architecture)
