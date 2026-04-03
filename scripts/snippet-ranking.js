#!/usr/bin/env node

/**
 * Snippet Ranking Module
 * 
 * Provides relevance scoring and filtering for cross-project search.
 * Implements ranking logic to prioritize relevant snippets based on query match.
 */

/**
 * Calculate relevance score for a snippet
 * 
 * @param {Object} snippet - The snippet to score
 * @param {string} query - The search query
 * @returns {number} The relevance score
 */
function calculateRelevanceScore(snippet, query) {
  let score = 0;
  const queryLower = query.toLowerCase();
  const nameLower = snippet.name.toLowerCase();
  
  // Name match (highest weight)
  if (nameLower.includes(queryLower)) {
    score += 10;
  }
  if (nameLower.startsWith(queryLower)) {
    score += 5;
  }
  
  // Description match
  if (snippet.description) {
    const descLower = snippet.description.toLowerCase();
    if (descLower.includes(queryLower)) {
      score += 3;
    }
  }
  
  // Tag match
  if (snippet.tags) {
    const tagCount = snippet.tags.filter(tag => tag.toLowerCase().includes(queryLower)).length;
    score += tagCount * 2;
  }
  
  // Content match (lower weight)
  const contentLower = snippet.content.toLowerCase();
  if (contentLower.includes(queryLower)) {
    score += 1;
  }
  
  return score;
}

/**
 * Filter snippets by query and options
 * 
 * @param {Array} snippets - Array of snippets to filter
 * @param {string} query - The search query
 * @param {Object} options - Filter options
 * @param {Array} options.tags - Filter by tags (array)
 * @param {string} options.language - Filter by language
 * @param {string} options.type - Filter by type
 * @param {boolean} options.crossProject - Include cross-project snippets
 * @returns {Array} Filtered snippets with relevance scores
 */
function filterAndRankSnippets(snippets, query, options = {}) {
  const {
    tags = [],
    language = '',
    type = '',
    crossProject = true
  } = options;

  // Filter snippets
  const filtered = snippets.filter(snippet => {
    // Filter by crossProject
    if (!snippet.crossProject && crossProject) return false;
    
    // Filter by language
    if (language && snippet.language !== language) return false;
    
    // Filter by type
    if (type && snippet.type !== type) return false;
    
    // Filter by tags
    if (tags.length > 0) {
      const snippetTags = snippet.tags || [];
      if (!tags.some(tag => snippetTags.includes(tag))) return false;
    }
    
    return true;
  });

  // Calculate relevance scores
  return filtered.map(snippet => ({
    ...snippet,
    relevanceScore: calculateRelevanceScore(snippet, query)
  }));
}

/**
 * Sort snippets by relevance score (descending)
 * 
 * @param {Array} snippets - Array of snippets with relevance scores
 * @returns {Array} Sorted snippets
 */
function sortSnippetsByRelevance(snippets) {
  return snippets.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Apply pagination to results
 * 
 * @param {Array} snippets - Array of snippets
 * @param {number} limit - Maximum number of results
 * @param {number} offset - Number of results to skip
 * @returns {Array} Paginated results
 */
function applyPagination(snippets, limit, offset) {
  return snippets.slice(offset, offset + limit);
}

/**
 * Get all unique tags from snippets
 * 
 * @param {Array} snippets - Array of snippets
 * @returns {Array} Array of unique tags
 */
function getAllTags(snippets) {
  const tags = new Set();
  snippets.forEach(snippet => {
    if (snippet.tags) {
      snippet.tags.forEach(tag => tags.add(tag));
    }
  });
  return Array.from(tags);
}

/**
 * Get all unique languages from snippets
 * 
 * @param {Array} snippets - Array of snippets
 * @returns {Array} Array of unique languages
 */
function getAllLanguages(snippets) {
  const languages = new Set();
  snippets.forEach(snippet => {
    languages.add(snippet.language);
  });
  return Array.from(languages);
}

/**
 * Get all unique types from snippets
 * 
 * @param {Array} snippets - Array of snippets
 * @returns {Array} Array of unique types
 */
function getAllTypes(snippets) {
  const types = new Set();
  snippets.forEach(snippet => {
    types.add(snippet.type);
  });
  return Array.from(types);
}

/**
 * Load snippet database from file
 * 
 * @param {string} filePath - Path to the database file
 * @returns {Array} Array of snippets
 */
function loadDatabase(filePath = null) {
  const fs = require('fs');
  const path = require('path');
  
  const dbPath = filePath || path.join(__dirname, 'snippet-database.json');
  
  try {
    const content = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Error loading database: ${e.message}`);
    return [];
  }
}

/**
 * Main execution
 */
function main() {
  const fs = require('fs');
  const path = require('path');
  
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('📊 Snippet Ranking Module');
    console.log('='.repeat(50));
    
    // Load default database
    const defaultPath = path.join(__dirname, 'snippet-database.json');
    let snippets;
    
    try {
      const content = fs.readFileSync(defaultPath, 'utf8');
      snippets = JSON.parse(content);
    } catch (e) {
      console.error(`Error loading database: ${e.message}`);
      process.exit(1);
    }
    
    console.log(`Loaded ${snippets.length} snippets.`);
    
    // Test ranking
    console.log('='.repeat(50));
    console.log('📊 Testing ranking...');
    
    const query = 'project';
    console.log(`Query: "${query}"`);
    
    // Filter and rank
    const filtered = filterAndRankSnippets(snippets, query, {
      tags: [],
      language: '',
      type: '',
      crossProject: true
    });
    
    // Sort by relevance
    const sorted = sortSnippetsByRelevance(filtered);
    
    // Apply pagination
    const paginated = applyPagination(sorted, 5, 0);
    
    console.log(`Found ${paginated.length} results:`);
    paginated.forEach((snippet, i) => {
      console.log(`  ${i + 1}. ${snippet.name} (score: ${snippet.relevanceScore})`);
      console.log(`     Type: ${snippet.type}, Language: ${snippet.language}`);
      console.log(`     Source: ${snippet.sourceFile}: ${snippet.sourceLine}`);
      console.log(`     Description: ${snippet.description}`);
    });
    
    // Show available filters
    console.log('='.repeat(50));
    console.log('📊 Available filters:');
    console.log(`  Tags: ${getAllTags(snippets).join(', ')}`);
    console.log(`  Languages: ${getAllLanguages(snippets).join(', ')}`);
    console.log(`  Types: ${getAllTypes(snippets).join(', ')}`);
    
    console.log('='.repeat(50));
    console.log('✅ Snippet ranking module ready!');
  } else {
    // Use provided query
    const query = args[0];
    const options = {};
    
    // Parse options
    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].slice(2);
        const value = args[i + 1];
        if (key === 'tags') options.tags = value.split(',');
        if (key === 'language') options.language = value;
        if (key === 'type') options.type = value;
      }
    }
    
    console.log('📊 Snippet Ranking Module');
    console.log('='.repeat(50));
    
    const databasePath = path.join(__dirname, 'snippet-database.json');
    let snippets;
    
    try {
      const content = fs.readFileSync(databasePath, 'utf8');
      snippets = JSON.parse(content);
    } catch (e) {
      console.error(`Error loading database: ${e.message}`);
      process.exit(1);
    }
    
    // Filter and rank
    const filtered = filterAndRankSnippets(snippets, query, options);
    
    // Sort by relevance
    const sorted = sortSnippetsByRelevance(filtered);
    
    console.log(`Query: "${query}"`);
    console.log(`Found ${sorted.length} results:`);
    
    sorted.forEach((snippet, i) => {
      console.log(`  ${i + 1}. ${snippet.name} (score: ${snippet.relevanceScore})`);
      console.log(`     Type: ${snippet.type}, Language: ${snippet.language}`);
      console.log(`     Source: ${snippet.sourceFile}: ${snippet.sourceLine}`);
      console.log(`     Description: ${snippet.description}`);
    });
    
    console.log('='.repeat(50));
    console.log('✅ Ranking complete!');
  }
}

// Export for use in other modules
module.exports = {
  calculateRelevanceScore,
  filterAndRankSnippets,
  sortSnippetsByRelevance,
  applyPagination,
  getAllTags,
  getAllLanguages,
  getAllTypes,
  loadDatabase
};

main();
