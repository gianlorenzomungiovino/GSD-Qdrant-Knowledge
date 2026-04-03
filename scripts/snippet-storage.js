#!/usr/bin/env node

/**
 * Database Storage for Code Snippets
 * 
 * Saves extracted snippets to vector database.
 * Stores snippet metadata, content, and generates embeddings.
 * Indexes snippets for cross-project search.
 */

const fs = require('fs');
const path = require('path');

/**
 * Mock database storage (for demonstration)
 * In production, this would use QdrantClient or similar
 */
class SnippetDatabase {
  constructor() {
    this.snippets = [];
    this.vectorIndex = [];
  }

  /**
   * Store a snippet
   */
  async storeSnippet(snippet) {
    // Generate UUID if not provided
    if (!snippet.id) {
      snippet.id = this.generateUUID();
    }
    
    // Add timestamp
    snippet.createdAt = new Date();
    snippet.updatedAt = new Date();
    
    // Generate embedding (mock)
    snippet.embedding = this.generateEmbedding(snippet);
    
    // Store snippet
    this.snippets.push(snippet);
    
    // Add to vector index
    this.vectorIndex.push({
      id: snippet.id,
      vector: snippet.embedding,
      payload: snippet
    });
    
    console.log(`✅ Stored snippet: ${snippet.name} (${snippet.type})`);
    
    return snippet;
  }

  /**
   * Generate UUID
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = r === 19 ? (Math.random() * 16 | 0).toString(16) : c;
      return v;
    });
  }

  /**
   * Generate embedding for semantic search
   */
  generateEmbedding(snippet) {
    // Mock embedding generation (would use transformers in production)
    const dimensions = 384; // MiniLM embedding dimensions
    const embedding = [];
    
    // Generate deterministic pseudo-random embedding based on snippet content
    const hash = this.hashString(snippet.name + snippet.content);
    
    for (let i = 0; i < dimensions; i++) {
      const seed = hash + i;
      const x = Math.sin(seed) * 10000;
      embedding.push((x - Math.floor(x)) * 2 - 1); // Normalize to [-1, 1]
    }
    
    return embedding;
  }

  /**
   * Hash string for deterministic embedding generation
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  /**
   * Search snippets by query
   */
  async searchSnippets(query, limit = 10) {
    // Mock search (would use vector search in production)
    const results = this.snippets.filter(s => {
          const nameMatch = s.name.toLowerCase().includes(query.toLowerCase());
          const descMatch = s.description?.toLowerCase().includes(query.toLowerCase());
          return nameMatch || descMatch;
        }).slice(0, limit);
    
    return results;
  }

  /**
   * Get all snippets
   */
  getAllSnippets() {
    return this.snippets;
  }
}

/**
 * Load extracted snippets from JSON file
 */
function loadSnippets(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Error loading snippets from ${filePath}: ${e.message}`);
    return [];
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Default: use extracted-snippets.json
    const defaultPath = path.join(__dirname, 'extracted-snippets.json');
    console.log('📦 Snippet Database Storage');
    console.log('='.repeat(50));
    console.log(`Loading snippets from: ${defaultPath}`);
    console.log('='.repeat(50));
        
    const snippets = loadSnippets(defaultPath);
    
    if (snippets.length === 0) {
      console.log('⚠️  No snippets found. Run snippet-extractor.js first.');
      process.exit(1);
    }
    
    console.log(`Found ${snippets.length} snippets to store.`);
    
    // Create database
    const db = new SnippetDatabase();
    
    // Store all snippets
    for (const snippet of snippets) {
      await db.storeSnippet(snippet);
    }
    
    console.log('='.repeat(50));
    console.log(`✅ Stored ${db.snippets.length} snippets in database`);
    
    // Save database state
    const dbPath = path.join(__dirname, 'snippet-database.json');
    fs.writeFileSync(dbPath, JSON.stringify(db.snippets, null, 2));
    console.log(`✅ Database state saved to: ${dbPath}`);
    
    // Test search
    console.log('='.repeat(50));
    console.log('🔍 Testing search...');
    const results = await db.searchSnippets('project');
    console.log(`Found ${results.length} results for 'project'`);
    if (results.length > 0) {
      console.log('Sample result:', results[0].name);
    }
  } else {
    // Use provided file path
    const inputPath = args[0];
    console.log('📦 Snippet Database Storage');
    console.log('='.repeat(50));
    console.log(`Loading snippets from: ${inputPath}`);
    console.log('='.repeat(50));
    
    const snippets = loadSnippets(inputPath);
    
    if (snippets.length === 0) {
      console.log('⚠️  No snippets found.');
      process.exit(1);
    }
    
    console.log(`Found ${snippets.length} snippets to store.`);
    
    const db = new SnippetDatabase();
    
    for (const snippet of snippets) {
      await db.storeSnippet(snippet);
    }
    
    console.log('='.repeat(50));
    console.log(`✅ Stored ${db.snippets.length} snippets in database`);
    
    const dbPath = path.join(__dirname, 'snippet-database.json');
    fs.writeFileSync(dbPath, JSON.stringify(db.snippets, null, 2));
    console.log(`✅ Database state saved to: ${dbPath}`);
  }
}

main();
