
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
