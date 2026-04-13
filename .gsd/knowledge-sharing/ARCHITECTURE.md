# Knowledge Sharing - Architettura Dettagliata

## Panoramica

Questo documento descrive l'architettura dettagliata del sistema di Knowledge Sharing per GSD.

## Componenti Principali

### 1. Cross-Project Knowledge Retriever

Il retriever è il cuore del sistema di knowledge sharing. Si occupa di:
- Cercare conoscenza in tutti i progetti indicizzati
- Applicare filtri e sorting
- Calcolare ranking basato su rilevanza, recency e importanza

#### API

```javascript
// Classe principale
class CrossProjectKnowledgeRetriever {
  constructor(options) {
    this.qdrantUrl = options.qdrantUrl || 'http://localhost:6333';
    this.collectionName = options.collectionName || 'gsd_memory';
    this.projectId = options.projectId;
  }

  // Cerca conoscenza in tutti i progetti (escludendo il progetto corrente)
  async search(query, options = {}) {
    // Options:
    // - excludeProjects: array di project_id da escludere
    // - includeCategories: array di categorie da includere
    // - excludeCategories: array di categorie da escludere
    // - minRelevance: minimum similarity score (0-1)
    // - limit: maximum number of results
    // - sortBy: 'relevance' | 'recency' | 'importance'
    // - sortOrder: 'asc' | 'desc'
  }

  // Cerca conoscenza in un progetto specifico
  async searchInProject(projectId, query, options = {}) {
    // Same options as search()
  }

  // Recupera conoscenza riutilizzabile da tutti i progetti
  async getReusableKnowledge(query, options = {}) {
    // Same options as search(), with reusable: true filter
  }
}
```

#### Algoritmo di Ranking

```javascript
function calculateRankingScore(result, querySimilarity) {
  const recencyScore = Math.min(1, (Date.now() - result.payload.timestamp) / (30 * 24 * 60 * 60 * 1000));
  const importanceScore = (result.payload.importance || 1) / 5;
  const reusableScore = result.payload.reusable ? 1 : 0.5;
  const categoryScore = result.payload.category === 'security' ? 1.2 : 1.0;
  
  return (
    querySimilarity * 0.6 +
    (1 - recencyScore) * 0.2 +
    importanceScore * 0.1 +
    reusableScore * 0.1
  );
}
```

### 2. MCP Server per Knowledge Retrieval

Il MCP server espone la knowledge base di Qdrant come tool MCP.

#### Tool Definiti

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `get_cross_project_knowledge` | Cerca conoscenza in tutti i progetti | `query: string`, `limit: number`, `excludeProjects: string[]` |
| `get_project_knowledge` | Cerca conoscenza in un progetto specifico | `projectId: string`, `query: string`, `limit: number` |
| `list_projects` | Elenca tutti i progetti indicizzati | - |
| `search_knowledge` | Ricerca avanzata con filtri | `query: string`, `filters: object`, `limit: number` |

#### Esempio di Implementazione

```javascript
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

const server = new McpServer({
  name: 'gsd-knowledge-server',
  version: '1.0.0'
});

server.tool('get_cross_project_knowledge', {
  query: { type: 'string', description: 'Query di ricerca' },
  limit: { type: 'number', description: 'Numero massimo di risultati', default: 5 },
  excludeProjects: { 
    type: 'array', 
    items: { type: 'string' },
    description: 'Lista di project_id da escludere'
  }
}, async ({ query, limit, excludeProjects }) => {
  const retriever = new CrossProjectKnowledgeRetriever({
    projectId: process.env.PROJECT_ID,
    qdrantUrl: process.env.QDRANT_URL
  });
  
  const results = await retriever.search(query, {
    excludeProjects: excludeProjects || [],
    limit: limit || 5
  });
  
  return {
    content: formatKnowledgeResults(results),
    projects: extractUniqueProjects(results)
  };
});

server.listen();
```

### 3. REST API per Knowledge Retrieval

La REST API espone la knowledge base come endpoint HTTP.

#### Endpoint Definiti

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/knowledge/retrieve` | POST | Cerca conoscenza in tutti i progetti |
| `/api/knowledge/retrieve/:projectId` | POST | Cerca conoscenza in un progetto specifico |
| `/api/projects/list` | GET | Elenca tutti i progetti indicizzati |
| `/api/categories/list` | GET | Elenca tutte le categorie disponibili |
| `/api/knowledge/search` | POST | Ricerca avanzata con filtri |

#### Esempio di Request/Response

```json
// POST /api/knowledge/retrieve
{
  "query": "come implementare autenticazione JWT",
  "excludeProjects": ["current-project"],
  "limit": 5,
  "sortBy": "relevance",
  "sortOrder": "desc"
}

// Response
{
  "success": true,
  "data": {
    "results": [
      {
        "project_id": "project-a",
        "title": "JWT Authentication Implementation",
        "content": "...",
        "similarity": 0.95,
        "reusable": true,
        "category": "security",
        "tags": ["auth", "jwt"],
        "source": ".gsd/DECISIONS.md",
        "summary": "Implementazione autenticazione JWT con jose library"
      },
      ...
    ],
    "total": 10,
    "page": 1,
    "pageSize": 5
  }
}
```

### 4. Knowledge Curation Agent

L'agente autonomo analizza i progetti e suggerisce knowledge sharing.

#### Funzionalità

- **Pattern Discovery**: Trova pattern comuni tra progetti
- **Reusable Detection**: Identifica componenti riutilizzabili
- **Category Assignment**: Assegna automaticamente categorie
- **Tag Recommendation**: Suggerisce tag per la conoscenza

#### Esempio di Implementazione

```javascript
class KnowledgeCurationAgent {
  constructor(options) {
    this.qdrantUrl = options.qdrantUrl || 'http://localhost:6333';
    this.collectionName = options.collectionName || 'gsd_memory';
  }

  // Analizza tutti i progetti e trova pattern comuni
  async analyzeProjects() {
    const projects = await this.getAllProjects();
    const patterns = await this.findCommonPatterns(projects);
    return patterns;
  }

  // Identifica componenti riutilizzabili
  async detectReusableComponents() {
    const results = await this.qdrantClient.search(this.collectionName, {
      queryVector: await this.generateEmbedding('reusable component'),
      limit: 100,
      with_payload: true
    });
    
    const reusable = results.filter(r => r.payload.reusable === true);
    return reusable;
  }

  // Assegna automaticamente categorie
  async assignCategories() {
    const results = await this.qdrantClient.search(this.collectionName, {
      queryVector: await this.generateEmbedding('category classification'),
      limit: 1000,
      with_payload: true
    });
    
    // Classifica ogni risultato e aggiorna il payload
    for (const result of results) {
      const category = this.classifyByCategory(result.payload.content);
      await this.updatePayload(result.id, { category });
    }
  }

  // Classifica la conoscenza in categorie
  classifyByCategory(content) {
    const categories = {
      'security': ['auth', 'jwt', 'oauth', 'security', 'encryption'],
      'database': ['db', 'sql', 'mongo', 'redis', 'prisma'],
      'api': ['rest', 'graphql', 'http', 'fetch', 'axios'],
      'ui': ['react', 'vue', 'angular', 'component', 'hook'],
      'tooling': ['cli', 'script', 'automation', 'workflow'],
      'testing': ['test', 'jest', 'vitest', 'mock', 'spec']
    };
    
    const contentLower = content.toLowerCase();
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => contentLower.includes(keyword))) {
        return category;
      }
    }
    return 'general';
  }
}
```

## Data Flow

### Flusso di Ricerca

```
1. Query Utente
   ↓
2. Generazione Embedding (query)
   ↓
3. Ricerca Qdrant (cross-project)
   ↓
4. Applicazione Filtri
   ↓
5. Calcolo Ranking
   ↓
6. Restituzione Risultati
```

### Flusso di Curazione

```
1. Scansione Progetti
   ↓
2. Analisi Contenuti
   ↓
3. Rilevamento Pattern
   ↓
4. Assegnazione Metadata
   ↓
5. Aggiornamento Qdrant
```

## Configurazione

### Variabili Ambiente

```bash
# Qdrant Configuration
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-api-key
COLLECTION_NAME=gsd_memory

# Project Configuration
PROJECT_ID=project-a

# Knowledge Sharing Configuration
ENABLE_CROSS_PROJECT=true
MAX_RESULTS=10
DEFAULT_CATEGORY=general
```

### Configurazione MCP Server

```json
{
  "mcpServers": {
    "gsd-knowledge": {
      "command": "node",
      "args": ["scripts/knowledge-sharing/mcp-server.js"],
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "PROJECT_ID": "project-a"
      }
    }
  }
}
```

## Testing

### Test Unitari

```javascript
describe('CrossProjectKnowledgeRetriever', () => {
  it('should search cross-project knowledge', async () => {
    const retriever = new CrossProjectKnowledgeRetriever({
      projectId: 'project-a',
      qdrantUrl: 'http://localhost:6333'
    });
    
    const results = await retriever.search('authentication', { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
  });

  it('should exclude specified projects', async () => {
    const retriever = new CrossProjectKnowledgeRetriever({
      projectId: 'project-a',
      qdrantUrl: 'http://localhost:6333'
    });
    
    const results = await retriever.search('authentication', {
      excludeProjects: ['project-a']
    });
    expect(results.every(r => r.project_id !== 'project-a')).toBe(true);
  });
});
```

### Test di Integrazione

```javascript
describe('Knowledge Sharing Integration', () => {
  it('should integrate with GSD auto', async () => {
    const gsd = new GSDAuto();
    const knowledge = await gsd.getKnowledgeSharingContext('authentication');
    expect(knowledge.results).toBeDefined();
  });
});
```

## Performance Considerations

### Caching

```javascript
class CachedRetriever extends CrossProjectKnowledgeRetriever {
  constructor(options) {
    super(options);
    this.cache = new Map();
    this.cacheTTL = 300000; // 5 minutes
  }

  async search(query, options) {
    const cacheKey = `${query}:${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    
    const results = await super.search(query, options);
    this.cache.set(cacheKey, {
      data: results,
      timestamp: Date.now()
    });
    
    return results;
  }
}
```

### Indicizzazione Ottimizzata

```javascript
// Creare indici per query frequenti
await client.createIndex('gsd_memory', {
  project_id: 'filter',
  category: 'filter',
  reusable: 'filter',
  timestamp: 'sort'
});
```

## Security Considerations

### Autenticazione

```javascript
// Middleware di autenticazione per REST API
const authenticate = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  const isValid = await validateApiKey(apiKey);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};
```

### Rate Limiting

```javascript
// Middleware di rate limiting
const rateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
```

## Monitoraggio e Logging

```javascript
class MonitoredRetriever extends CrossProjectKnowledgeRetriever {
  async search(query, options) {
    const startTime = Date.now();
    
    try {
      const results = await super.search(query, options);
      const duration = Date.now() - startTime;
      
      logger.info('Knowledge search completed', {
        query,
        resultsCount: results.length,
        duration,
        projectId: this.projectId
      });
      
      return results;
    } catch (error) {
      logger.error('Knowledge search failed', {
        query,
        error: error.message,
        projectId: this.projectId
      });
      throw error;
    }
  }
}
```

## Future Enhancements

1. **Real-time Updates**: Aggiornare la knowledge base in tempo reale quando nuovi dati vengono indicizzati
2. **Smart Suggestions**: Suggerire automaticamente knowledge sharing basato su contesto
3. **User Feedback**: Permettere agli utenti di valutare la qualità dei risultati di knowledge sharing
4. **Multi-language Support**: Supportare conoscenza in multiple lingue
5. **Federated Search**: Cercare conoscenza in più istanze Qdrant distribuite

---

**Last updated**: 2026-04-13
**Author**: Gianlorenzo
**Version**: 2.0 (Updated - removed Smart Context Loader)
