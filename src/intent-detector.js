#!/usr/bin/env node

/**
 * Intent Detector Module
 * 
 * Provides heuristic rules to translate natural language queries into structured search intent.
 * Analyzes user input to determine search type, filters, and preferences.
 */

/**
 * Detect intent from a natural language query
 * 
 * @param {string} query - The natural language search query
 * @returns {Object} Structured search intent with type, filters, and preferences
 */
function detectIntent(query) {
  const normalizedQuery = query.trim().toLowerCase();
  
  // Initialize intent structure
  const intent = {
    originalQuery: query,
    type: 'search', // Default type
    query: normalizedQuery,
    filters: {},
    preferences: {}
  };
  
  // Detect search type based on keywords
  intent.type = detectSearchType(normalizedQuery);
  
  // Extract filters based on query patterns
  intent.filters = extractFilters(normalizedQuery, intent.type);
  
  // Extract preferences (limit, sort, etc.)
  intent.preferences = extractPreferences(normalizedQuery);
  
  // For search types, extract the actual search terms
  if (intent.type === 'search') {
    intent.query = extractSearchTerms(normalizedQuery, intent.filters);
  }
  
  return intent;
}

/**
 * Detect the type of search based on query keywords
 * 
 * @param {string} query - Normalized query string
 * @returns {string} The detected search type
 */
function detectSearchType(query) {
  const searchTypePatterns = {
    'tags': /\b(tags|tag|etichette|etichetta|categoria|categorie)\b/,
    'type': /\b(type|tipo|tipologia|tipologie|categoria|categoría)\b/,
    'language': /\b(language|lingua|linguaggio|lang|langue)\b/,
    'project': /\b(project|progetto|progetti|cross-project|cross project)\b/,
    'exact': /^\s*["'].*["']\s*$/, // Quoted string
    'prefix': /\b(for|prefix|prefisso|prefixe)\b/,
    'contains': /\b(contains|contiene|includes|include)\b/,
    'starts': /\b(starts|inizi|comincia|begin)\b/,
    'fuzzy': /\b(fuzzy|approssimativo|similare|fuzzi)\b/,
    // Code placement patterns — documentation takes priority over config when both match
    'documentation': /\b(documentation|documentazione|docs|wiki|manuale)\b/,
    'script': /\b(cli|command|script|scripting|esecuzione|esecuzione)\b/,
    'utility': /\b(utility|helper|aiuto|help|funzione|function|libreria|librerias)\b/,
    'component': /\b(component|componente|ui|interface|interfaccia|widget)\b/,
    'test': /\b(test|testing|prove|testare|suite|test suite)\b/,
    'config': /\b(config|configuration|configurazione|configuratione|settings|impostazioni)\b/,
    'snippet': /\b(snippet|pezzo|tratto|porzione)\b/,
    'example': /\b(example|esempio|esempi|sample|campioni|demo)\b/
  };
  
  for (const [type, pattern] of Object.entries(searchTypePatterns)) {
    if (pattern.test(query)) {
      return type;
    }
  }
  
  return 'search';
}

/**
 * Extract filters from the query
 * 
 * @param {string} query - Normalized query string
 * @param {string} searchType - The detected search type
 * @returns {Object} Object containing filter key-value pairs
 */
function extractFilters(query, searchType) {
  const filters = {};
  
  // Extract language filter
  const langPatterns = {
    'javascript': /\b(javascript|js|js\.|\.js)\b/,
    'typescript': /\b(typescript|ts|\.ts)\b/,
    'python': /\b(python|py|\.py)\b/,
    'go': /\b(go|golang|\.go)\b/,
    'rust': /\b(rust|rs|\.rs)\b/,
    'java': /\b(java|\.java)\b/,
    'c': /\b(c|\.c)\b/,
    'cpp': /\b(c\+\+|cpp|\.cpp|\.cc)\b/,
    'c#': /\b(c#|c\#|\.cs)\b/,
    'ruby': /\b(ruby|rb|\.rb)\b/,
    'php': /\b(php|\.php)\b/,
    'html': /\b(html|\.html|\.htm)\b/,
    'css': /\b(css|\.css)\b/,
    'sql': /\b(sql|\.sql)\b/,
    'json': /\b(json|\.json)\b/,
    'yaml': /\b(yaml|yml|\.yaml|\.yml)\b/,
    'markdown': /\b(markdown|md|\.md)\b/,
    'shell': /\b(shell|bash|sh|\.sh)\b/,
    'docker': /\b(docker|dockerfile|\.dockerfile)\b/,
    'other': /\b(other|altro|diverso)\b/
  };
  
  for (const [lang, pattern] of Object.entries(langPatterns)) {
    if (pattern.test(query)) {
      filters.language = lang;
      break;
    }
  }
  
  // Extract type filter
  const typePatterns = {
    'snippet': /\bsnippet\b/,
    'config': /\b(config|configuration|configurazione|configuratione)\b/,
    'example': /\b(example|esempio|esempi|sample|campione|campioni)\b/,
    'template': /\b(template|modello|modelli)\b/,
    'documentation': /\b(documentation|documentazione|docs)\b/,
    'code': /\b(code|codice)\b/,
    'script': /\b(script|scripting)\b/,
    'utility': /\b(utility|utilità|utilità|utils|utils)\b/,
    'helper': /\b(helper|aiuto|aiuto|help)\b/,
    'library': /\b(library|libreria|librerias|lib)\b/,
    'framework': /\b(framework|frameworks|cornice|cornici)\b/,
    'tool': /\b(tool|strumento|strumenti)\b/,
    'test': /\b(test|testing|prove|testare)\b/,
    'build': /\b(build|costruzione|compilazione|builds)\b/,
    'deploy': /\b(deploy|deployment|deployment|deployments|distribuzione|distribuzioni)\b/,
    'ci': /\b(ci|cd|continuous integration|continuous deployment|integrazione continua|distribuzione continua)\b/,
    'docker': /\b(docker|container|containers|containerizzazione|containerizzazione)\b/,
    'database': /\b(database|db|sql|nosql|data|dati)\b/,
    'api': /\b(api|rest|graphql|grpc|endpoint)\b/,
    'frontend': /\b(frontend|front-end|interface|interfaccia|ui|ux)\b/,
    'backend': /\b(backend|back-end|server|server-side|lato server)\b/,
    'devops': /\b(devops|dev-ops)\b/,
    'security': /\b(security|sicurezza|protezione|security|safeguard|safeguards)\b/,
    'performance': /\b(performance|prestazioni|performance|optimization|ottimizzazione)\b/,
    'other': /\b(other|altro|diverso|generico|generic)\b/
  };
  
  for (const [type, pattern] of Object.entries(typePatterns)) {
    if (pattern.test(query)) {
      filters.type = type;
      break;
    }
  }
  
  // Extract tag filters
  const tagPatterns = {
    'react': /\b(react|react\.js|@react)\b/,
    'vue': /\b(vue|vue\.js|@vue)\b/,
    'angular': /\b(angular|@angular)\b/,
    'next': /\b(next|next\.js|@next)\b/,
    'svelte': /\b(svelte|@svelte)\b/,
    'express': /\b(express|@express)\b/,
    'nest': /\b(nest|@nestjs)\b/,
    'fastapi': /\b(fastapi|fastapi)\b/,
    'django': /\b(django|@django)\b/,
    'flask': /\b(flask|@flask)\b/,
    'pytest': /\b(pytest|@pytest)\b/,
    'jest': /\b(jest|@jest)\b/,
    'vitest': /\b(vitest|@vitest)\b/,
    'mocha': /\b(mocha|@mocha)\b/,
    'cypress': /\b(cypress|@cypress)\b/,
    'playwright': /\b(playwright|@playwright)\b/,
    'tailwind': /\b(tailwind|@tailwindcss)\b/,
    'bootstrap': /\b(bootstrap|@bootstrap)\b/,
    'material': /\b(material|@material|@mui)\b/,
    'graphql': /\b(graphql|@apollo|urql|@urql)\b/,
    'prisma': /\b(prisma|@prisma)\b/,
    'drizzle': /\b(drizzle|@drizzle)\b/,
    'mongoose': /\b(mongoose|@mongoose)\b/,
    'sequelize': /\b(sequelize|@sequelize)\b/,
    'typeorm': /\b(typeorm|@typeorm)\b/,
    'redis': /\b(redis|@redis)\b/,
    'elasticsearch': /\b(elasticsearch|elastic|@elastic)\b/,
    'postgres': /\b(postgres|postgresql|@postgres)\b/,
    'mysql': /\b(mysql|@mysql)\b/,
    'mongodb': /\b(mongodb|@mongodb|mongo)\b/,
    'aws': /\b(aws|amazon web services|@aws|@amazonaws)\b/,
    'google': /\b(google|gcp|google cloud|@google)\b/,
    'azure': /\b(azure|microsoft azure|@azure)\b/,
    'docker': /\b(docker|@docker)\b/,
    'kubernetes': /\b(kubernetes|k8s|@kubernetes|@k8s)\b/,
    'terraform': /\b(terraform|@hashicorp)\b/,
    'github': /\b(github|@github)\b/,
    'gitlab': /\b(gitlab|@gitlab)\b/,
    'npm': /\b(npm|@npm)\b/,
    'yarn': /\b(yarn|@yarn)\b/,
    'pnpm': /\b(pnpm|@pnpm)\b/,
    'vite': /\b(vite|@vitejs)\b/,
    'webpack': /\b(webpack|@webpack)\b/,
    'babel': /\b(babel|@babel)\b/,
    'eslint': /\b(eslint|@eslint)\b/,
    'prettier': /\b(prettier|@prettier)\b/,
    'typescript': /\b(typescript|@typescript)\b/,
    'jest': /\b(jest|@jest)\b/,
    'testing': /\b(testing|test|tests|prove)\b/
  };
  
  const foundTags = [];
  for (const [tag, pattern] of Object.entries(tagPatterns)) {
    if (pattern.test(query)) {
      foundTags.push(tag);
    }
  }
  
  if (foundTags.length > 0) {
    filters.tags = foundTags;
  }
  
  // Extract project scope
  if (/\b(cross-project|cross project|multi-project|multi project|progetto|progetti)\b/.test(query)) {
    filters.crossProject = true;
  }
  
  return filters;
}

/**
 * Extract user preferences from the query
 * 
 * @param {string} query - Normalized query string
 * @returns {Object} Object containing user preferences
 */
function extractPreferences(query) {
  const preferences = {};
  
  // Extract limit (e.g., "limit 5", "top 10", "max 3")
  const limitMatch = query.match(/\b(limit|top|max|maximo|migliori|prima|prime)\b\s*\d+/);
  if (limitMatch) {
    const limitNum = parseInt(query.match(/\d+/)[0], 10);
    preferences.limit = limitNum;
  }
  
  // Extract sort preference
  if (/\b(sort|ordina|ordine|sorted|asc|desc|alphabetical|alfabetico)\b/.test(query)) {
    preferences.sort = 'alphabetical';
  }
  
  // Extract relevance preference
  if (/\b(relevant|relevante|top|best|migliore|più rilevante)\b/.test(query)) {
    preferences.sort = 'relevance';
  }
  
  // Extract pagination preference
  if (/\b(page|pagina|pagine|offset|paggina)\b/.test(query)) {
    preferences.pagination = true;
  }
  
  // Extract exact match preference
  if (/^["'].*["']$/.test(query)) {
    preferences.exact = true;
  }
  
  // Extract fuzzy match preference
  if (/\b(fuzzy|approximate|approssimativo|similare|fuzzi)\b/.test(query)) {
    preferences.fuzzy = true;
  }
  
  return preferences;
}

/**
 * Extract search terms from query after removing filter keywords and stopwords.
 * 
 * @param {string} query - Normalized query string
 * @param {Object} filters - Extracted filters
 * @returns {string} Clean search terms
 */
function extractSearchTerms(query, filters) {
  let terms = query;
  
  // Remove filter keywords and their values
  const filterKeywords = [
    'javascript', 'js', 'typescript', 'ts', 'python', 'py', 'go', 'golang',
    'rust', 'rs', 'java', 'c', 'cpp', 'c#', 'ruby', 'rb', 'php', 'html',
    'css', 'sql', 'json', 'yaml', 'yml', 'markdown', 'md', 'shell', 'bash',
    'sh', 'docker', 'dockerfile', 'other', 'snippet', 'config', 'configuration',
    'example', 'esempio', 'sample', 'template', 'modello', 'documentation',
    'documentazione', 'code', 'codice', 'script', 'utility', 'utils', 'helper',
    'help', 'library', 'libreria', 'framework', 'tool', 'strumento', 'test',
    'testing', 'build', 'deploy', 'ci', 'cd', 'database', 'db', 'api', 'frontend',
    'backend', 'devops', 'security', 'sicurezza', 'performance', 'prestazioni',
    'cross-project', 'multi-project', 'project', 'progetto', 'tags', 'tag',
    'type', 'tipo', 'language', 'lingua', 'limit', 'top', 'max', 'sort', 'order',
    'relevance', 'relevant', 'page', 'pagina', 'fuzzy', 'approximate', 'similare'
  ];
  
  // Remove known filter keywords
  filterKeywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    terms = terms.replace(regex, '');
  });
  
  // Clean up multiple spaces and trim
  terms = terms.replace(/\s+/g, ' ').trim();
  
  return terms;
}

/**
 * Keyword extraction for embedding queries.
 * 
 * Simple fallback: tokenize, filter noise (stopwords + short/long tokens).
 * This is a minimal safety net — the primary normalization should happen via
 * KNOWLEDGE.md instructions to the LLM before calling auto_retrieve.
 */
function extractKeywords(query) {
  if (!query || typeof query !== 'string') return '';

  const normalized = query.toLowerCase().trim();
  
  // Split on whitespace, punctuation, hyphens, underscores
  const tokens = normalized.split(/[\s\-_.,;:!?(){}[\]<>\/\\|@#$%^&*+=~`]+/);
  
  // Filter stopwords (English + Italian) and noise tokens
  const STOPWORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'to', 'of', 'in',
    'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'out',
    'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but',
    'and', 'or', 'if', 'while', 'about', 'up', 'il', 'lo', 'la', 'i',
    'gli', 'le', 'un', 'uno', 'una', 'del', 'dello', 'della', 'dei',
    'degli', 'delle', 'nel', 'nello', 'nella', 'nei', 'negli', 'nelle',
    'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle', 'al', 'allo',
    'alla', 'ai', 'agli', 'alle', 'di', 'da', 'in', 'con', 'su', 'per',
    'tra', 'fra', 'che', 'e', 'ed', 'o', 'oppure', 'ma', 'perché',
    'poiché', 'se', 'quando', 'mentre', 'come'
  ]);

  const meaningful = tokens.filter(t => 
    t.length >= 2 && 
    t.length <= 40 && 
    !STOPWORDS.has(t)
  );
  
  if (meaningful.length === 0) return '';

  // Return all meaningful tokens — no artificial cap. The embedding model handles variable length.
  return meaningful.join(' ');
}

/**
 * Build a Qdrant filter payload from structured intent.
 *
 * Certain filters (language, type, project_id with confident values) become
 * `must` clauses — they must match for a point to be returned.
 * Only low-confidence or absent-filter cases go into `should` as soft boosts.
 *
 * @param {Object} intent - The structured search intent
 * @returns {Object} Qdrant-compatible filter object with must/should clauses
 */
function buildQdrantFilter(intent) {
  const must = [];
  const should = [];

  // ── language (certain) ────────────────────────────────────────────
  if (intent.filters.language) {
    // Map our internal language names to Qdrant stored values
    const langMap = {
      javascript: 'javascript',
      typescript: 'typescript',
      python: 'python',
      go: 'go',
      rust: 'rust',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      'c#': 'csharp',
      ruby: 'ruby',
      php: 'php',
      html: 'html',
      css: 'css',
      sql: 'sql',
      json: 'json',
      yaml: 'yaml',
      shell: 'shell',
      docker: 'docker',
    };
    const qdrantLang = langMap[intent.filters.language] || intent.filters.language;
    must.push({ key: 'language', match: { value: qdrantLang } });
  }

  // ── type → soft boost (should, not must) ────────────────────────
  // Type hints are suggestions to the DB: matching points get a score bump.
  // They never exclude results — that's what semantic similarity + re-ranking do.
  const KNOWN_PAYLOAD_TYPES = new Set(['code', 'doc']);
  const TYPE_MAP = {
    component: 'code', test: 'code', config: 'code', script: 'code',
    utility: 'code', helper: 'code', library: 'code', framework: 'code',
    tool: 'code', snippet: 'code', example: 'code', template: 'code',
    build: 'code', deploy: 'code', ci: 'code', docker: 'code',
    database: 'code', api: 'code', frontend: 'code', backend: 'code',
    devops: 'code', security: 'code', performance: 'code',
    documentation: 'doc',
  };

  if (intent.filters.type) {
    const mappedType = TYPE_MAP[intent.filters.type];
    if (mappedType && KNOWN_PAYLOAD_TYPES.has(mappedType)) {
      should.push({ key: 'type', match: { value: mappedType } });
      console.log('[qdrant] filter: type "%s" → payload "%s" (soft boost)', intent.filters.type, mappedType);
    } else if (intent.filters.type) {
      // Unknown search type — no mapping exists. Skip entirely.
      console.log('[qdrant] filter: unknown type "%s", skipping', intent.filters.type);
    }
  }

  // ── project_id → soft boost (should, not must) ──────────────────
  if (intent.filters.project_id) {
    should.push({ key: 'project_id', match: { value: intent.filters.project_id } });
    console.log('[qdrant] filter: project "%s" (soft boost)', intent.filters.project_id);
  }

  // ── tags → soft boost (should) ────────────────────────────────────
  if (intent.filters.tags && intent.filters.tags.length > 0) {
    for (const tag of intent.filters.tags) {
      should.push({ key: 'tags', match: { value: tag } });
    }
  }

  // ── crossProject scope ────────────────────────────────────────────
  if (intent.filters.crossProject) {
    // No filter needed — just means don't exclude other projects.
    // If crossProject is false, we could add a must for project_id match.
  }

  const filter = {};
  if (must.length > 0) filter.must = must;
  if (should.length > 0) filter.should = should;

  // Log what we built for agent observability
  console.log('[qdrant] filter: must=%d, should=%d', must.length, should.length);

  return Object.keys(filter).length > 0 ? filter : null;
}

/**
 * Generate a search query from structured intent
 * 
 * @param {Object} intent - The structured intent
 * @returns {string} Formatted search query string
 */
function generateQuery(intent) {
  const parts = [];
  
  // Add search terms
  if (intent.query) {
    parts.push(intent.query);
  }
  
  // Add filters
  if (intent.filters.language) {
    parts.push(`lang:${intent.filters.language}`);
  }
  
  if (intent.filters.type) {
    parts.push(`type:${intent.filters.type}`);
  }
  
  if (intent.filters.tags && intent.filters.tags.length > 0) {
    parts.push(`tags:${intent.filters.tags.join(',')}`);
  }
  
  if (intent.filters.crossProject) {
    parts.push('cross:true');
  }
  
  // Add preferences
  if (intent.preferences.limit) {
    parts.push(`limit:${intent.preferences.limit}`);
  }
  
  if (intent.preferences.sort) {
    parts.push(`sort:${intent.preferences.sort}`);
  }
  
  if (intent.preferences.exact) {
    parts.push('exact:true');
  }
  
  if (intent.preferences.fuzzy) {
    parts.push('fuzzy:true');
  }
  
  return parts.join(' ');
}

/**
 * Main execution - test the intent detector
 */
function main() {
  const testQueries = [
    'javascript code for React component',
    'typescript example with TypeScript and JSDoc',
    'Python utility function',
    'Go snippet for Kubernetes deployment',
    'Cross-project search for API endpoints',
    'Limit 5 top results for database query',
    'Sort by relevance for performance optimization',
    '"exact match" query',
    'fuzzy search for similar code',
    'HTML template with Tailwind CSS'
  ];
  
  console.log('🔍 Intent Detector Module');
  console.log('='.repeat(60));
  console.log('Testing intent detection with natural language queries:\n');
  
  testQueries.forEach(query => {
    const intent = detectIntent(query);
    console.log(`Original: "${query}"`);
    console.log('Detected Intent:');
    console.log(`  Type: ${intent.type}`);
    console.log(`  Query: ${intent.query || '(none)'}`);
    console.log(`  Filters: ${JSON.stringify(intent.filters) || '(none)'}`);
    console.log(`  Preferences: ${JSON.stringify(intent.preferences) || '(none)'}`);
    console.log(`  Generated: "${generateQuery(intent)}"`);
    console.log('-'.repeat(60));
  });
  
  // Test buildQdrantFilter
  console.log('\n--- Qdrant Filter Builder ---');
  testQueries.forEach(query => {
    const intent = detectIntent(query);
    const filter = buildQdrantFilter(intent);
    console.log(`Query: "${query}"`);
    console.log(`  filter: ${JSON.stringify(filter)}`);
    console.log('-'.repeat(60));
  });

  console.log('\n✅ Intent detector module ready!');
}

// Export for use in other modules
module.exports = {
  detectIntent,
  detectSearchType,
  extractFilters,
  extractPreferences,
  extractSearchTerms,
  extractKeywords,
  generateQuery,
  buildQdrantFilter
};

// Execute if run directly
if (require.main === module) {
  main();
}
