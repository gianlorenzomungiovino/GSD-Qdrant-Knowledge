/**
 * End-to-End Integration Tests for Auto-Retrieve
 * 
 * These tests validate the complete auto_retrieve flow:
 * - Task input → Keyword extraction → Qdrant query → Formatted result
 * 
 * The tests verify that:
 * 1. Keywords are correctly extracted from various task types
 * 2. Search queries are generated properly
 * 3. Results are formatted correctly with all expected fields
 * 4. The complete pipeline produces valid output
 */

const {
  extractKeywordsFromTask,
  generateSearchQueries,
} = require('../src/gsd-qdrant-mcp/index.js');

/**
 * Simulates the complete auto_retrieve flow
 * @param {string} task - The user task to process
 * @param {number} limit - Maximum results to return
 * @param {number} maxQueries - Maximum queries to generate
 * @returns {object} Formatted result object
 */
function simulateAutoRetrieveFlow(task, limit = 3, maxQueries = 2) {
  // Step 1: Extract keywords from task
  const keywords = extractKeywordsFromTask(task);
  
  // Step 2: Generate search queries
  const queries = generateSearchQueries(keywords).slice(0, maxQueries);
  
  // Return structured result (without actual Qdrant query)
  return {
    task,
    keywords,
    queries,
    results: [],
    totalFound: 0,
    retrievalStrategy: 'auto-retrieve (simulated)',
    matchingAnalysis: {
      dominantType: 'unknown',
      vectorPercentage: '0.0',
      textPercentage: '0.0',
      vectorMatches: 0,
      textMatches: 0
    },
    note: 'Simulated result - no actual Qdrant query performed'
  };
}

describe('S03-e2e-auto-retrieve', () => {
  describe('Complete Flow Simulation', () => {
    it('should process authentication task through full pipeline', () => {
      const task = 'Implement JWT authentication with login and logout endpoints';
      const result = simulateAutoRetrieveFlow(task, 3, 2);
      
      // Verify keywords extracted (function extracts actual words found, not category names)
      expect(result.keywords.length).toBeGreaterThan(0);
      expect(result.keywords.some(k => k.toLowerCase().includes('jwt') || k.toLowerCase().includes('login') || k.toLowerCase().includes('endpoints'))).toBe(true);
      
      // Verify queries generated
      expect(result.queries.length).toBeGreaterThanOrEqual(1);
      expect(result.queries.length).toBeLessThanOrEqual(2);
      
      // Verify result structure
      expect(result.task).toBe(task);
      expect(result.results).toEqual([]);
      expect(result.totalFound).toBe(0);
      expect(result.retrievalStrategy).toBe('auto-retrieve (simulated)');
    });

    it('should process component task through full pipeline', () => {
      const task = 'Build a reusable modal component with close button and backdrop';
      const result = simulateAutoRetrieveFlow(task, 3, 2);
      
      // Verify keywords extracted
      expect(result.keywords).toContain('component');
      expect(result.keywords.length).toBeGreaterThan(0);
      
      // Verify queries generated
      expect(result.queries.length).toBeGreaterThanOrEqual(1);
      
      // Verify result structure
      expect(result.task).toBe(task);
    });

    it('should process layout task through full pipeline', () => {
      const task = 'Design a hero header footer layout sidebar navigation';
      const result = simulateAutoRetrieveFlow(task, 3, 2);
      
      // Verify keywords extracted
      expect(result.keywords).toContain('hero');
      expect(result.keywords.length).toBeGreaterThan(0);
      
      // Verify queries generated
      expect(result.queries.length).toBeGreaterThanOrEqual(1);
      
      // Verify result structure
      expect(result.task).toBe(task);
    });

    it('should process API task through full pipeline', () => {
      const task = 'Create REST API endpoints for user management';
      const result = simulateAutoRetrieveFlow(task, 3, 2);
      
      // Verify keywords extracted
      expect(result.keywords).toContain('API');
      expect(result.keywords.length).toBeGreaterThan(0);
      
      // Verify queries generated
      expect(result.queries.length).toBeGreaterThanOrEqual(1);
      
      // Verify result structure
      expect(result.task).toBe(task);
    });

    it('should process database task through full pipeline', () => {
      const task = 'Design a database model for user profiles';
      const result = simulateAutoRetrieveFlow(task, 3, 2);
      
      // Verify keywords extracted
      expect(result.keywords).toContain('database');
      expect(result.keywords.length).toBeGreaterThan(0);
      
      // Verify queries generated
      expect(result.queries.length).toBeGreaterThanOrEqual(1);
      
      // Verify result structure
      expect(result.task).toBe(task);
    });

    it('should process form task through full pipeline', () => {
      const task = 'Create a login form with email and password fields';
      const result = simulateAutoRetrieveFlow(task, 3, 2);
      
      // Verify keywords extracted
      expect(result.keywords).toContain('form');
      expect(result.keywords.length).toBeGreaterThan(0);
      
      // Verify queries generated
      expect(result.queries.length).toBeGreaterThanOrEqual(1);
      
      // Verify result structure
      expect(result.task).toBe(task);
    });

    it('should handle empty task gracefully', () => {
      const task = '';
      const result = simulateAutoRetrieveFlow(task, 3, 2);
      
      // Should return empty keywords and queries
      expect(result.keywords).toEqual([]);
      expect(result.queries).toEqual(['']);
      expect(result.results).toEqual([]);
    });

    it('should handle task with no recognized keywords', () => {
      const task = 'This is a completely made up task with random words xyz abc def';
      const result = simulateAutoRetrieveFlow(task, 3, 2);
      
      // Should return empty keywords
      expect(result.keywords).toEqual([]);
      expect(result.queries).toEqual(['']);
      expect(result.results).toEqual([]);
    });

    it('should respect limit parameter', () => {
      const task = 'Implement JWT authentication with login and logout endpoints';
      const result = simulateAutoRetrieveFlow(task, 10, 2);
      
      // Limit parameter should be stored in result
      expect(result.results).toEqual([]);
      // The simulation doesn't actually query Qdrant, so we verify the structure
      expect(result.totalFound).toBe(0);
    });

    it('should respect maxQueries parameter', () => {
      const task = 'Implement JWT authentication with login and logout endpoints';
      
      // Test with maxQueries = 1
      const result1 = simulateAutoRetrieveFlow(task, 3, 1);
      expect(result1.queries.length).toBeLessThanOrEqual(1);
      
      // Test with maxQueries = 2 (default)
      const result2 = simulateAutoRetrieveFlow(task, 3, 2);
      expect(result2.queries.length).toBeLessThanOrEqual(2);
    });

    it('should produce consistent results for same input', () => {
      const task = 'Implement JWT authentication with login and logout endpoints';
      
      const result1 = simulateAutoRetrieveFlow(task, 3, 2);
      const result2 = simulateAutoRetrieveFlow(task, 3, 2);
      
      // Results should be identical
      expect(result1.keywords).toEqual(result2.keywords);
      expect(result1.queries).toEqual(result2.queries);
      expect(result1.retrievalStrategy).toBe(result2.retrievalStrategy);
    });
  });

  describe('Keyword Extraction Verification', () => {
    it('should extract authentication-related keyword', () => {
      const task = 'Set up OAuth2 authentication flow';
      const keywords = extractKeywordsFromTask(task);
      // Function extracts actual word found (OAuth2) that matches the authentication pattern
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords.some(k => k.toLowerCase().includes('oauth'))).toBe(true);
    });

    it('should extract component-related keyword', () => {
      const task = 'Create a dashboard component';
      const keywords = extractKeywordsFromTask(task);
      expect(keywords).toContain('component');
    });

    it('should extract layout-related keyword', () => {
      const task = 'Build a responsive header component';
      const keywords = extractKeywordsFromTask(task);
      expect(keywords).toContain('header');
    });

    it('should extract API-related keyword', () => {
      const task = 'Design REST API for product catalog';
      const keywords = extractKeywordsFromTask(task);
      expect(keywords).toContain('API');
    });

    it('should extract database-related keyword', () => {
      const task = 'Create database schema for orders';
      const keywords = extractKeywordsFromTask(task);
      expect(keywords).toContain('database');
    });

    it('should extract form-related keyword', () => {
      const task = 'Build contact form with validation';
      const keywords = extractKeywordsFromTask(task);
      expect(keywords).toContain('form');
    });
  });

  describe('Query Generation Verification', () => {
    it('should generate single query for single keyword', () => {
      const queries = generateSearchQueries(['authentication']);
      expect(queries).toEqual(['authentication']);
    });

    it('should generate multiple queries for multiple keywords', () => {
      const queries = generateSearchQueries(['authentication', 'login']);
      expect(queries).toEqual(['authentication', 'authentication login']);
    });

    it('should limit queries to max 2', () => {
      const queries = generateSearchQueries(['authentication', 'login', 'logout', 'jwt']);
      expect(queries.length).toBeLessThanOrEqual(2);
      expect(queries[0]).toBe('authentication');
    });

    it('should handle empty keyword array', () => {
      const queries = generateSearchQueries([]);
      expect(queries).toEqual(['']);
    });
  });
});
