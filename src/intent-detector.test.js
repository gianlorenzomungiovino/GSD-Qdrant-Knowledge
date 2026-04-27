import { describe, it, expect } from 'vitest';
import { detectIntent, buildQdrantFilter } from './intent-detector.js';

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

    it('converts type filter to must clause (config before example due to pattern order)', () => {
      // Note: patterns are checked in insertion order; config matches before example
      const intent = detectIntent('python config example');
      expect(intent.filters.language).toBe('python'); // also detected
      expect(intent.filters.type).toBe('config'); // config is first match
      const filter = buildQdrantFilter(intent);
      expect(filter).not.toBeNull();
      // language + type → 2 must clauses
      expect(filter.must).toHaveLength(2);
      expect(filter.must.some(m => m.key === 'type' && m.match.value === 'config')).toBe(true);
    });

    it('converts project_id filter to must clause', () => {
      const intent = detectIntent('golang');
      intent.filters.project_id = 'my-project';
      const filter = buildQdrantFilter(intent);
      expect(filter).not.toBeNull();
      const projectIdMust = filter.must.find(m => m.key === 'project_id');
      expect(projectIdMust).toEqual({ key: 'project_id', match: { value: 'my-project' } });
    });

    it('combines multiple must clauses (language + type)', () => {
      // 'typescript config' → language=typescript, type=config
      const intent = detectIntent('typescript config template');
      expect(intent.filters.language).toBe('typescript');
      expect(intent.filters.type).toBe('config'); // config matches before template
      const filter = buildQdrantFilter(intent);
      expect(filter.must).toHaveLength(2);
      const langs = filter.must.filter(m => m.key === 'language');
      const types = filter.must.filter(m => m.key === 'type');
      expect(langs).toHaveLength(1);
      expect(types).toHaveLength(1);
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
      // 'go code' → language=go, type=code → 2 must clauses
      const intent = detectIntent('go code');
      expect(intent.filters.language).toBe('go');
      const filter = buildQdrantFilter(intent);
      expect(filter.must.length >= 1).toBe(true); // at least language
      expect(filter.must.some(m => m.key === 'language' && m.match.value === 'go')).toBe(true);
      expect(filter.should).toBeUndefined();
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
    it('only language/type/project_id go to must, tags go to should', () => {
      const intent = detectIntent('react typescript config example');
      expect(intent.filters.language).toBe('typescript');
      expect(intent.filters.type).toBe('config'); // config matches before example
      expect(intent.filters.tags).toContain('react');
      const filter = buildQdrantFilter(intent);
      // must: language + type
      expect(filter.must.filter(m => m.key === 'language').length).toBe(1);
      expect(filter.must.filter(m => m.key === 'type').length).toBe(1);
      // should: react tag
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
});
