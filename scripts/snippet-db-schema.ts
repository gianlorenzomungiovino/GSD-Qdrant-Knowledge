
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
