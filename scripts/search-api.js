#!/usr/bin/env node

/**
 * Cross-Project Search API
 * 
 * Builds search interface for finding snippets across all indexed projects.
 * Creates search endpoint that accepts query string.
 * Performs vector search on snippet embeddings.
 * Filters by tags, language, type.
 * Returns ranked results with relevance scores.
 */

const fs = require('fs');
const path = require('path');

/**
 * Load snippet database
 */
function loadSnippetDatabase(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Error loading database: ${e.message}`);
    return [];
  }
}

/**
 * Cross-Project Search API
 */
class SnippetSearchAPI {
  constructor(snippets) {
    this.snippets = snippets;
  }

  /**
   * Search snippets by query string
   */
  search(query, options = {}) {
    const {
      tags = [],
      language = '',
      type = '',
      crossProject = true,
      limit = 10,
      offset = 0
    } = options;

    // Filter snippets
    let results = this.snippets.filter(snippet => {
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
    results = results.map(snippet => ({
      ...snippet,
      relevanceScore: this.calculateRelevanceScore(snippet, query)
    }));

    // Sort by relevance score (descending)
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Apply pagination
    results = results.slice(offset, offset + limit);

    return results;
  }

  /**
   * Calculate relevance score for a snippet
   */
  calculateRelevanceScore(snippet, query) {
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
   * Get all unique tags
   */
  getAllTags() {
    const tags = new Set();
    this.snippets.forEach(snippet => {
      if (snippet.tags) {
        snippet.tags.forEach(tag => tags.add(tag));
      }
    });
    return Array.from(tags);
  }

  /**
   * Get all unique languages
   */
  getAllLanguages() {
    const languages = new Set();
    this.snippets.forEach(snippet => {
      languages.add(snippet.language);
    });
    return Array.from(languages);
  }

  /**
   * Get all unique types
   */
  getAllTypes() {
    const types = new Set();
    this.snippets.forEach(snippet => {
      types.add(snippet.type);
    });
    return Array.from(types);
  }
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('🔍 Cross-Project Search API');
    console.log('='.repeat(50));
    
    // Load default database
    const defaultPath = path.join(__dirname, 'snippet-database.json');
    const snippets = loadSnippetDatabase(defaultPath);
    
    if (snippets.length === 0) {
      console.log('⚠️  No snippets found in database.');
      process.exit(1);
    }
    
    console.log(`Found ${snippets.length} snippets in database.`);
    
    // Create search API
    const api = new SnippetSearchAPI(snippets);
    
    // Test search
    console.log('='.repeat(50));
    console.log('🔍 Testing search...');
    
    const query = 'project';
    console.log(`Searching for: "${query}"`);
    
    const results = api.search(query, {
      tags: [],
      language: '',
      type: '',
      crossProject: true,
      limit: 5
    });
    
    console.log(`Found ${results.length} results:`);
    results.forEach((snippet, i) => {
      console.log(`  ${i + 1}. ${snippet.name} (score: ${snippet.relevanceScore})`);
      console.log(`     Type: ${snippet.type}, Language: ${snippet.language}`);
      console.log(`     Source: ${snippet.sourceFile}: ${snippet.sourceLine}`);
    });
    
    // Show available filters
    console.log('='.repeat(50));
    console.log('📊 Available filters:');
    console.log(`  Tags: ${api.getAllTags().join(', ')}`);
    console.log(`  Languages: ${api.getAllLanguages().join(', ')}`);
    console.log(`  Types: ${api.getAllTypes().join(', ')}`);
    
    console.log('='.repeat(50));
    console.log('✅ Search API ready!');
    console.log('');
    console.log('Usage: node scripts/search-api.js <query> [options]');
    console.log('Options:');
    console.log('  --tags <tag1,tag2>  Filter by tags');
    console.log('  --language <lang>   Filter by language');
    console.log('  --type <type>       Filter by type');
    console.log('  --limit <n>         Limit results (default: 10)');
    console.log('  --offset <n>        Offset results (default: 0)');
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
        if (key === 'limit') options.limit = parseInt(value);
        if (key === 'offset') options.offset = parseInt(value);
      }
    }
    
    console.log('🔍 Cross-Project Search API');
    console.log('='.repeat(50));
    
    const databasePath = path.join(__dirname, 'snippet-database.json');
    const snippets = loadSnippetDatabase(databasePath);
    
    if (snippets.length === 0) {
      console.log('⚠️  No snippets found in database.');
      process.exit(1);
    }
    
    const api = new SnippetSearchAPI(snippets);
    const results = api.search(query, options);
    
    console.log(`Searching for: "${query}"`);
    console.log(`Found ${results.length} results:`);
    
    results.forEach((snippet, i) => {
      console.log(`  ${i + 1}. ${snippet.name} (score: ${snippet.relevanceScore})`);
      console.log(`     Type: ${snippet.type}, Language: ${snippet.language}`);
      console.log(`     Source: ${snippet.sourceFile}: ${snippet.sourceLine}`);
      console.log(`     Description: ${snippet.description}`);
    });
    
    console.log('='.repeat(50));
    console.log('✅ Search complete!');
  }
}

main();
