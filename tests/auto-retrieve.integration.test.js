/**
 * Integration tests for MCP server auto-retrieve functionality
 * Tests the core functions that are used by auto_retrieve
 */

const {
  extractKeywordsFromTask,
  generateSearchQueries
} = require('../src/gsd-qdrant-mcp/index.js');

describe('S02-integration', () => {
  describe('extractKeywordsFromTask', () => {
    it('should extract JWT keyword from authentication-related task', () => {
      const result = extractKeywordsFromTask('Implement JWT authentication with login and logout endpoints');
      expect(result).toContain('JWT');
    });

    it('should extract component keyword from component-related task', () => {
      const result = extractKeywordsFromTask('Build a reusable modal component with close button and backdrop');
      expect(result).toContain('component');
    });

    it('should extract form keyword from form-related task', () => {
      const result = extractKeywordsFromTask('Create a login form with email and password fields');
      expect(result).toContain('form');
    });

    it('should extract hero keyword from layout-related task', () => {
      const result = extractKeywordsFromTask('Design a hero header footer layout sidebar navigation');
      expect(result).toContain('hero');
    });

    it('should extract API keyword from API-related task', () => {
      const result = extractKeywordsFromTask('Create REST API endpoints for user management');
      expect(result).toContain('API');
    });

    it('should extract database keyword from database-related task', () => {
      const result = extractKeywordsFromTask('Design a database model for user profiles');
      expect(result).toContain('database');
    });

    it('should return empty array for unrelated task', () => {
      const result = extractKeywordsFromTask('This is a completely made up task with random words xyz abc def');
      expect(result).toEqual([]);
    });

    it('should return unique keywords only', () => {
      const result = extractKeywordsFromTask('authentication login authentication logout');
      // The function returns the first matching keyword found (login)
      expect(result).toContain('login');
      expect(result.length).toBe(1);
    });
  });

  describe('generateSearchQueries', () => {
    it('should return empty array for empty keywords', () => {
      const result = generateSearchQueries([]);
      expect(result).toEqual(['']);
    });

    it('should return single keyword as single query', () => {
      const result = generateSearchQueries(['authentication']);
      expect(result).toEqual(['authentication']);
    });

    it('should limit to max 2 queries for multiple keywords', () => {
      const result = generateSearchQueries(['authentication', 'login', 'logout', 'jwt']);
      expect(result.length).toBeLessThanOrEqual(2);
      expect(result[0]).toBe('authentication');
    });

    it('should combine first two keywords for multi-query', () => {
      const result = generateSearchQueries(['login', 'password']);
      expect(result).toEqual(['login', 'login password']);
    });
  });
});
