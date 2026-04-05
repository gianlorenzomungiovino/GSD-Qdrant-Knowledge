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
    'fuzzy': /\b(fuzzy|approssimativo|similare|fuzzi)\b/
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
 * Extract search terms from query after removing filter keywords
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
  
  console.log('\n✅ Intent detector module ready!');
}

// Export for use in other modules
module.exports = {
  detectIntent,
  detectSearchType,
  extractFilters,
  extractPreferences,
  extractSearchTerms,
  generateQuery
};

// Execute if run directly
main();
