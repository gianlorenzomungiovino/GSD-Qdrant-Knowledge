#!/usr/bin/env node

/**
 * Code Snippet Database Schema Design
 * 
 * This script defines the database schema for storing code snippets
 * independently of the .gsd structure, enabling cross-project reuse.
 */

const fs = require('fs');
const path = require('path');

// Schema definition for code snippets
const snippetSchema = {
  // Core fields
  id: {
    type: 'string',
    required: true,
    description: 'Unique identifier for the snippet'
  },
  type: {
    type: 'enum',
    values: ['function', 'class', 'module', 'config', 'script'],
    required: true,
    description: 'Type of code snippet'
  },
  name: {
    type: 'string',
    required: true,
    description: 'Human-readable name of the snippet'
  },
  language: {
    type: 'string',
    required: true,
    description: 'Programming language (javascript, typescript, etc.)'
  },
  
  // Source location
  sourceFile: {
    type: 'string',
    required: true,
    description: 'File path where snippet was extracted from'
  },
  sourceLine: {
    type: 'number',
    required: true,
    description: 'Line number where snippet starts'
  },
  
  // Content
  content: {
    type: 'text',
    required: true,
    description: 'The actual code content of the snippet'
  },
  description: {
    type: 'text',
    required: false,
    description: 'What the snippet does'
  },
  
  // Metadata
  tags: {
    type: 'array',
    items: { type: 'string' },
    required: false,
    description: 'Tags for search and categorization'
  },
  dependencies: {
    type: 'array',
    items: { type: 'string' },
    required: false,
    description: 'Internal dependencies within snippet'
  },
  context: {
    type: 'text',
    required: false,
    description: 'Usage context and examples'
  },
  
  // Metrics
  metrics: {
    type: 'object',
    properties: {
      lines: { type: 'number' },
      complexity: { type: 'number' },
      testCoverage: { type: 'number' }
    },
    required: false,
    description: 'Code quality metrics'
  },
  
  // Cross-project capability
  crossProject: {
    type: 'boolean',
    required: true,
    description: 'Whether snippet can be reused across projects'
  },
  
  // Timestamps
  createdAt: {
    type: 'timestamp',
    required: true,
    description: 'When snippet was created'
  },
  updatedAt: {
    type: 'timestamp',
    required: true,
    description: 'When snippet was last updated'
  }
};

// Generate SQL schema
function generateSqlSchema() {
  return `
-- Code Snippets Database Schema
-- Enables cross-project code reuse via vector search

CREATE TABLE snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core fields
  type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  language VARCHAR(50) NOT NULL,
  
  -- Source location
  source_file TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  
  -- Content
  content TEXT NOT NULL,
  description TEXT,
  
  -- Metadata
  tags TEXT[],
  dependencies TEXT[],
  context TEXT,
  
  -- Metrics
  metrics_json JSONB,
  
  -- Cross-project capability
  cross_project BOOLEAN NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for search
CREATE INDEX idx_snippets_type ON snippets(type);
CREATE INDEX idx_snippets_language ON snippets(language);
CREATE INDEX idx_snippets_tags ON snippets USING gin(tags);
CREATE INDEX idx_snippets_cross_project ON snippets(cross_project);

-- Full-text search index
CREATE INDEX idx_snippets_name ON snippets USING gin(to_tsvector('english', name));
CREATE INDEX idx_snippets_description ON snippets USING gin(to_tsvector('english', description));
CREATE INDEX idx_snippets_content ON snippets USING gin(to_tsvector('english', content));

-- Vector search index (for semantic search)
-- Requires pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE VECTOR INDEX idx_snippets_embedding ON snippets USING vector(embedding_cosine_ops) WITH (dims=512);

-- Add embedding column
ALTER TABLE snippets ADD COLUMN embedding VECTOR(512);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_snippets_updated_at
BEFORE UPDATE ON snippets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Add metadata table for additional snippet information
CREATE TABLE snippet_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID REFERENCES snippets(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (snippet_id, key)
);

-- Add metrics table for detailed code analysis
CREATE TABLE snippet_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID REFERENCES snippets(id) ON DELETE CASCADE,
  lines INTEGER,
  complexity_score DECIMAL(5,2),
  test_coverage DECIMAL(5,2),
  cyclomatic_complexity INTEGER,
  maintainability_index DECIMAL(5,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add usage examples table
CREATE TABLE snippet_usage_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID REFERENCES snippets(id) ON DELETE CASCADE,
  example_text TEXT NOT NULL,
  usage_type VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`;
}

// Generate TypeScript interfaces
function generateTypescriptInterfaces() {
  return `
/**
 * Code Snippet Database Schema
 * 
 * Represents a code snippet that can be reused across projects.
 */
export interface Snippet {
  // Core fields
  id: string;
  type: 'function' | 'class' | 'module' | 'config' | 'script';
  name: string;
  language: string;
  
  // Source location
  sourceFile: string;
  sourceLine: number;
  
  // Content
  content: string;
  description?: string;
  
  // Metadata
  tags?: string[];
  dependencies?: string[];
  context?: string;
  
  // Metrics
  metrics?: {
    lines: number;
    complexity: number;
    testCoverage: number;
  };
  
  // Cross-project capability
  crossProject: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Vector search
  embedding?: number[];
}

/**
 * Snippet metadata key-value pairs
 */
export interface SnippetMetadata {
  id: string;
  snippetId: string;
  key: string;
  value: string;
  createdAt: Date;
}

/**
 * Code metrics for snippet analysis
 */
export interface SnippetMetrics {
  id: string;
  snippetId: string;
  lines?: number;
  complexityScore?: number;
  testCoverage?: number;
  cyclomaticComplexity?: number;
  maintainabilityIndex?: number;
  createdAt: Date;
}

/**
 * Usage examples for snippets
 */
export interface SnippetUsageExample {
  id: string;
  snippetId: string;
  exampleText: string;
  usageType?: string;
  createdAt: Date;
}

/**
 * Query parameters for snippet search
 */
export interface SnippetSearchQuery {
  query?: string;
  type?: string[];
  language?: string;
  tags?: string[];
  crossProject?: boolean;
  minComplexity?: number;
  maxComplexity?: number;
  minTestCoverage?: number;
  limit?: number;
  offset?: number;
}

/**
 * Search result with similarity score
 */
export interface SnippetSearchResult extends Snippet {
  similarity?: number;
  snippets?: SnippetSearchResult[];
}
`;
}

// Main execution
function main() {
  const scriptsDir = path.join(__dirname);
  
  // Generate SQL schema
  const sqlSchema = generateSqlSchema();
  const sqlPath = path.join(scriptsDir, 'snippet-db-schema.sql');
  fs.writeFileSync(sqlPath, sqlSchema, 'utf8');
  console.log(`✅ SQL schema written to: ${sqlPath}`);
  
  // Generate TypeScript interfaces
  const tsInterfaces = generateTypescriptInterfaces();
  const tsPath = path.join(scriptsDir, 'snippet-db-schema.ts');
  fs.writeFileSync(tsPath, tsInterfaces, 'utf8');
  console.log(`✅ TypeScript interfaces written to: ${tsPath}`);
  
  console.log('✅ Database schema design complete!');
  console.log('\nNext steps:');
  console.log('1. Review the generated schema files');
  console.log('2. Install pgvector extension for vector search');
  console.log('3. Create database migration scripts');
  console.log('4. Implement snippet extraction logic');
}

main();
