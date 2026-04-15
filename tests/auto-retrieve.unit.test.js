/**
 * Unit Tests for Auto-Retrieve Core Functions
 * 
 * Tests for extractKeywordsFromTask and generateSearchQueries functions.
 * This ensures the core logic is correct before testing full integration.
 */

import { describe, it, expect } from 'vitest';
import {
  extractKeywordsFromTask,
  generateSearchQueries,
} from '../src/gsd-qdrant-mcp/index.js';

describe('S02-core', () => {
  describe('extractKeywordsFromTask', () => {
    describe('Positive Tests', () => {
      it('should extract authentication keywords', () => {
        const task = 'Implement authentication system with JWT tokens';
        const keywords = extractKeywordsFromTask(task);
        expect(keywords).toContain('JWT');
      });

      it('should extract component keywords', () => {
        const task = 'Create a reusable hero component';
        const keywords = extractKeywordsFromTask(task);
        expect(keywords).toContain('component');
      });

      it('should extract layout keywords', () => {
        const task = 'Design the main layout with sidebar';
        const keywords = extractKeywordsFromTask(task);
        expect(keywords).toContain('layout');
      });

      it('should extract API keywords', () => {
        const task = 'Build REST API endpoints for data fetching';
        const keywords = extractKeywordsFromTask(task);
        expect(keywords).toContain('API');
      });

      it('should extract database keywords', () => {
        const task = 'Set up database models and schema';
        const keywords = extractKeywordsFromTask(task);
        expect(keywords).toContain('database');
      });

      it('should extract form keywords', () => {
        const task = 'Create user registration form with validation';
        const keywords = extractKeywordsFromTask(task);
        expect(keywords).toContain('form');
      });

      it('should return unique keywords only', () => {
        const task = 'Build authentication and login system';
        const keywords = extractKeywordsFromTask(task);
        const uniqueKeywords = [...new Set(keywords)];
        expect(keywords).toEqual(uniqueKeywords);
      });
    });

    describe('Negative Tests', () => {
      it('should return empty array for empty string', () => {
        const task = '';
        const keywords = extractKeywordsFromTask(task);
        expect(keywords).toEqual([]);
      });

      it('should return empty array for non-matching text', () => {
        const task = 'Random text without any recognized keywords';
        const keywords = extractKeywordsFromTask(task);
        expect(keywords).toEqual([]);
      });

      it('should throw error for null input', () => {
        expect(() => extractKeywordsFromTask(null)).toThrow();
      });

      it('should throw error for undefined input', () => {
        expect(() => extractKeywordsFromTask(undefined)).toThrow();
      });
    });

    describe('Edge Cases', () => {
      it('should handle single word task', () => {
        const task = 'login';
        const keywords = extractKeywordsFromTask(task);
        expect(keywords).toContain('login');
      });

      it('should handle mixed case keywords', () => {
        const task = 'JWT Authentication System';
        const keywords = extractKeywordsFromTask(task);
        expect(keywords).toContain('JWT');
      });
    });
  });

  describe('generateSearchQueries', () => {
    describe('Positive Tests', () => {
      it('should generate single query from one keyword', () => {
        const keywords = ['authentication'];
        const queries = generateSearchQueries(keywords);
        expect(queries).toEqual(['authentication']);
      });

      it('should generate two queries from two keywords', () => {
        const keywords = ['authentication', 'login'];
        const queries = generateSearchQueries(keywords);
        expect(queries).toEqual(['authentication', 'authentication login']);
      });

      it('should limit to max 2 queries when more keywords provided', () => {
        const keywords = ['auth', 'login', 'signup', 'oauth'];
        const queries = generateSearchQueries(keywords);
        expect(queries).toEqual(['auth', 'auth login']);
        expect(queries.length).toBe(2);
      });
    });

    describe('Negative Tests', () => {
      it('should return empty string for empty keywords', () => {
        const keywords = [];
        const queries = generateSearchQueries(keywords);
        expect(queries).toEqual(['']);
      });

      it('should handle empty array', () => {
        const keywords = [];
        const queries = generateSearchQueries(keywords);
        expect(Array.isArray(queries)).toBe(true);
      });
    });

    describe('Edge Cases', () => {
      it('should handle single character keywords', () => {
        const keywords = ['a'];
        const queries = generateSearchQueries(keywords);
        expect(queries).toEqual(['a']);
      });

      it('should handle keywords with special characters', () => {
        const keywords = ['@mention'];
        const queries = generateSearchQueries(keywords);
        expect(queries).toEqual(['@mention']);
      });
    });
  });
});
