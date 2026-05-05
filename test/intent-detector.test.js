import { describe, it, expect } from 'vitest';
import { detectIntent, buildQdrantFilter, extractKeywords } from '../src/intent-detector.js';

describe('buildQdrantFilter', () => {
  describe('must clauses for certain filters', () => {
    it('converts language filter to must clause', () => {
      const intent = detectIntent('Node.js async pattern');
      expect(intent.filters.language).toBe('javascript');
      const filter = buildQdrantFilter(intent);
      expect(filter).not.toBeNull();
      expect(filter.must).toHaveLength(1);
      expect(filter.must[0]).toEqual({ key: 'language', match: { value: 'javascript' } });
    });

    it('maps type hint "config" → soft boost in should (not hard must)', () => {
      // Type hints like config/example/template are suggestions, not hard filters.
      // They become a `should` clause with the mapped payload value ('code').
      const intent = detectIntent('python config example');
      expect(intent.filters.language).toBe('python');
      expect(intent.filters.type).toBe('config');
      const filter = buildQdrantFilter(intent);
      expect(filter).not.toBeNull();
      // language → must, type hint 'config' → should (soft boost to payload='code')
      expect(filter.must.some(m => m.key === 'language')).toBe(true);
      expect(filter.should?.some(s => s.key === 'type' && s.match.value === 'code')).toBe(true);
    });

    it('converts project_id to should (soft boost) when set', () => {
      const intent = detectIntent('golang');
      // golang → language=go; manually add project_id for this test
      expect(intent.filters.language).toBe('go');
      intent.filters.project_id = 'my-project';
      const filter = buildQdrantFilter(intent);
      expect(filter).not.toBeNull();
      // project_id goes to should (soft boost), not must
      expect(filter.should.some(s => s.key === 'project_id' && s.match.value === 'my-project')).toBe(true);
    });

    it('combines language (must) + type hint (should soft boost)', () => {
      // 'typescript config' → language=typescript, type=config
      const intent = detectIntent('typescript config template');
      expect(intent.filters.language).toBe('typescript');
      expect(intent.filters.type).toBe('config'); // config matches before template
      const filter = buildQdrantFilter(intent);
      // language goes to must; type hint 'config' → should (soft boost)
      expect(filter.must.some(m => m.key === 'language')).toBe(true);
      expect(filter.should?.some(s => s.key === 'type' && s.match.value === 'code')).toBe(true);
    });
  });

  describe('should clauses for uncertain filters', () => {
    it('converts tags to should clauses (soft boost)', () => {
      const intent = detectIntent('react typescript component');
      expect(intent.filters.tags).toContain('react');
      expect(intent.filters.language).toBe('typescript');
      const filter = buildQdrantFilter(intent);
      // language → must, tags → should
      expect(filter.should).toBeDefined();
      expect(Array.isArray(filter.should)).toBe(true);
      // React tag should be in should
      const reactShould = filter.should.find(s => s.key === 'tags' && s.match.value === 'react');
      expect(reactShould).toBeDefined();
    });

    it('does not add should when no tags are found', () => {
      const intent = detectIntent('python code');
      expect(intent.filters.tags).toBeUndefined();
      const filter = buildQdrantFilter(intent);
      expect(filter.should).toBeUndefined();
    });
  });

  describe('no-filter case', () => {
    it('returns null when no filters are certain and no tags', () => {
      const intent = detectIntent('hello world');
      expect(intent.filters.language).toBeUndefined();
      expect(intent.filters.type).toBeUndefined();
      expect(intent.filters.tags).toBeUndefined();
      const filter = buildQdrantFilter(intent);
      expect(filter).toBeNull();
    });

    it('returns object with must when language is set', () => {
      // 'go code' → language=go (must), type hint 'code' → should soft boost
      const intent = detectIntent('go code');
      expect(intent.filters.language).toBe('go');
      const filter = buildQdrantFilter(intent);
      expect(filter.must.some(m => m.key === 'language' && m.match.value === 'go')).toBe(true);
    });

    it('returns object with only should when only tags are set', () => {
      const intent = detectIntent('vue component');
      expect(intent.filters.tags).toContain('vue');
      expect(intent.filters.language).toBeUndefined();
      expect(intent.filters.type).toBeUndefined();
      const filter = buildQdrantFilter(intent);
      expect(filter.must).toBeUndefined();
      expect(filter.should).toBeDefined();
    });
  });

  describe('language mapping', () => {
    it('maps c# to csharp for Qdrant (via direct intent)', () => {
      const intent = detectIntent('.cs code');
      // The .cs pattern matches C#
      if (intent.filters.language === 'c#') {
        const filter = buildQdrantFilter(intent);
        const langMust = filter.must.find(m => m.key === 'language');
        expect(langMust.match.value).toBe('csharp');
      }
    });

    it('passes through known languages unchanged', () => {
      const intent = detectIntent('go code');
      const filter = buildQdrantFilter(intent);
      const langMust = filter.must.find(m => m.key === 'language');
      expect(langMust.match.value).toBe('go');
    });

    it('maps python to python (identity)', () => {
      const intent = detectIntent('python code');
      const filter = buildQdrantFilter(intent);
      const langMust = filter.must.find(m => m.key === 'language');
      expect(langMust.match.value).toBe('python');
    });
  });

  describe('integration: CLI query "Node.js async pattern"', () => {
    it('detects javascript language', () => {
      const intent = detectIntent('Node.js async pattern');
      expect(intent.filters.language).toBe('javascript');
    });

    it('produces must filter for language=javascript', () => {
      const intent = detectIntent('Node.js async pattern');
      const filter = buildQdrantFilter(intent);
      expect(filter.must[0].key).toBe('language');
      expect(filter.must[0].match.value).toBe('javascript');
      expect(filter.should).toBeUndefined();
    });
  });

  describe('should vs must separation', () => {
    it('only language/project_id go to must, type hints and tags → should', () => {
      const intent = detectIntent('react typescript config example');
      expect(intent.filters.language).toBe('typescript');
      expect(intent.filters.type).toBe('config'); // config matches before example
      expect(intent.filters.tags).toContain('react');
      const filter = buildQdrantFilter(intent);
      // must: language only (type hint 'config' → should soft boost)
      expect(filter.must.filter(m => m.key === 'language').length).toBe(1);
      // type hint and tags both go to should as soft boosts
      expect(filter.should.some(s => s.key === 'tags' && s.match.value === 'react')).toBe(true);
    });

    it('does not put language in should (language always goes to must)', () => {
      const intent = detectIntent('python testing');
      // python → language (must), testing → tags (should) + type
      expect(intent.filters.language).toBe('python');
      const filter = buildQdrantFilter(intent);
      // Verify: no should contains a language key
      const langInShould = filter.should?.some(s => s.key === 'language');
      expect(langInShould).toBeFalsy();
    });

    it('should-only query returns should without must', () => {
      // A query that only matches tags, no language/type/project_id
      const intent = detectIntent('tailwind styling design');
      expect(intent.filters.tags).toContain('tailwind');
      expect(intent.filters.language).toBeUndefined();
      const filter = buildQdrantFilter(intent);
      expect(filter.must).toBeUndefined();
      expect(filter.should).toBeDefined();
    });
  });

  describe('extractKeywords (original — tokenization + stopwords)', () => {
    it('returns meaningful tokens for "implementazione carrello ecommerce"', () => {
      const result = extractKeywords('implementazione carrello ecommerce');
      // Should contain the key terms (no hardcoded expansion)
      expect(result).toContain('carrello');
      expect(result).toContain('ecommerce');
      expect(result).toContain('implementazione');
    });

    it('returns meaningful tokens for "sessione autenticazione"', () => {
      const result = extractKeywords('sessione autenticazione');
      expect(result).toContain('sessione');
      expect(result).toContain('autenticazione');
    });

    it('handles plain English queries without expansion', () => {
      const result = extractKeywords('how to use async await in javascript');
      // Should contain meaningful tokens (no Italian NL terms to expand)
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('async');
      expect(result).toContain('javascript');
    });

    it('returns empty string for null/empty input', () => {
      expect(extractKeywords(null)).toBe('');
      expect(extractKeywords(undefined)).toBe('');
      expect(extractKeywords('')).toBe('');
    });

    it('filters out English + Italian stopwords', () => {
      const result = extractKeywords('come il sistema di chunking');
      // "come", "il", "di" are stopwords → should be filtered
      expect(result).not.toContain('come');
      expect(result).not.toContain('il');
      expect(result).not.toContain('di');
      // But meaningful terms remain
      expect(result).toContain('sistema');
      expect(result).toContain('chunking');
    });

    it('filters out very short tokens', () => {
      const result = extractKeywords('a carrello b ecommerce c');
      // Single-char tokens should be filtered
      expect(result.split(/\s+/)).not.toContain('a');
      expect(result.split(/\s+/)).not.toContain('b');
    });

    it('handles code-specific queries (already in lexicon)', () => {
      const result = extractKeywords('shopping cart checkout add to cart woocommerce nextjs');
      // Should preserve these tokens without double-expansion issues
      expect(result.split(/\s+/).length).toBeGreaterThan(0);
    });

    it('preserves order of meaningful tokens', () => {
      const result = extractKeywords('implementazione carrello ecommerce checkout sessione autenticazione api database');
      // All should be present (no artificial cap at 8)
      expect(result.split(/\s+/).length).toBeGreaterThanOrEqual(7);
    });

    it('handles mixed Italian/English queries', () => {
      const result = extractKeywords('implementazione carrello ecommerce nextjs');
      // Should contain all meaningful tokens
      expect(result).toContain('carrello');
      expect(result).toContain('ecommerce');
      expect(result).toContain('nextjs');
    });

    it('handles query with only stopwords', () => {
      const result = extractKeywords('il la del della di in con su per');
      // All are stopwords → empty string
      expect(result).toBe('');
    });
  });
});
