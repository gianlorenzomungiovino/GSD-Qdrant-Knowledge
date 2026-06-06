const { detectPatterns, getTopPatterns } = require('./pattern-detection');

describe('detectPatterns', () => {
  it('detects TypeScript from a .tsx source path', () => {
    const result = detectPatterns('src/components/Button.tsx', '', '', null);
    expect(result.categories.framework).toContain('TypeScript');
  });

  it('detects React and TypeScript from .tsx source with React content', () => {
    const result = detectPatterns('src/components/Button.tsx', 'React button component', 'import React from "react"', null);
    expect(result.categories.frontend).toContain('React');
    expect(result.categories.framework).toContain('TypeScript');
  });

  it('detects React from content mentioning React', () => {
    const result = detectPatterns('', 'Builds a React component', 'import React from "react"', null);
    expect(result.categories.frontend).toContain('React');
  });

  it('detects Express from import statement', () => {
    const result = detectPatterns('', '', 'import express from "express"', null);
    expect(result.categories.backend).toContain('Express');
  });

  it('detects GSD ROADMAP from .gsd/ROADMAP.md path', () => {
    const result = detectPatterns('.gsd/ROADMAP.md', '', '', null);
    expect(result.categories.gsd).toContain('ROADMAP');
  });

  it('detects CONTEXT from content mentioning CONTEXT', () => {
    const result = detectPatterns('', '', 'This is a CONTEXT file for GSD', null);
    expect(result.categories.gsd).toContain('CONTEXT');
  });

  it('detects multiple patterns from combined inputs', () => {
    const result = detectPatterns(
      'src/server.ts',
      'Express server with TypeScript',
      'import express from "express"',
      'backend,typescript'
    );
    expect(result.categories.backend).toContain('Express');
    expect(result.categories.framework).toContain('TypeScript');
  });

  it('detects TypeScript from .ts extension', () => {
    const result = detectPatterns('src/index.ts', '', '', null);
    expect(result.categories.framework).toContain('TypeScript');
  });

  it('detects Docker from content', () => {
    const result = detectPatterns('', '', 'docker-compose up', null);
    expect(result.categories.infrastructure).toContain('Docker');
  });

  it('detects PostgreSQL from content', () => {
    const result = detectPatterns('', '', 'postgresql database connection', null);
    expect(result.categories.database).toContain('PostgreSQL');
  });

  it('detects MongoDB from content', () => {
    const result = detectPatterns('', '', 'mongodb connection string', null);
    expect(result.categories.database).toContain('MongoDB');
  });

  it('detects Next.js from content', () => {
    const result = detectPatterns('', '', 'next.js app with server components', null);
    expect(result.categories.frontend).toContain('Next.js');
  });

  it('detects Vue from content', () => {
    const result = detectPatterns('', '', 'vue 3 composition api', null);
    expect(result.categories.frontend).toContain('Vue');
  });

  it('detects Jest from content', () => {
    const result = detectPatterns('', '', 'jest test suite', null);
    expect(result.categories.testing).toContain('Jest');
  });

  it('detects Vite from content', () => {
    const result = detectPatterns('', '', 'vite build configuration', null);
    expect(result.categories.build).toContain('Vite');
  });

  it('detects Webpack from content', () => {
    const result = detectPatterns('', '', 'webpack config file', null);
    expect(result.categories.build).toContain('Webpack');
  });

  it('returns empty categories for empty payload', () => {
    const result = detectPatterns('', '', '', null);
    expect(result.categories).toEqual({});
  });

  it('handles null source gracefully', () => {
    const result = detectPatterns(null, null, null, null);
    expect(result.categories).toEqual({});
  });

  it('handles tags as array', () => {
    const result = detectPatterns('', '', '', ['jest', 'react']);
    expect(result.categories.testing).toContain('Jest');
    expect(result.categories.frontend).toContain('React');
  });

  it('handles tags as comma-separated string', () => {
    const result = detectPatterns('', '', '', 'jest,react');
    expect(result.categories.testing).toContain('Jest');
    expect(result.categories.frontend).toContain('React');
  });

  it('handles undefined inputs gracefully', () => {
    const result = detectPatterns(undefined, undefined, undefined, undefined);
    expect(result.categories).toEqual({});
  });

  it('detects STATE from STATE.md path', () => {
    const result = detectPatterns('.gsd/STATE.md', '', '', null);
    expect(result.categories.gsd).toContain('STATE');
  });

  it('detects DECISIONS from content', () => {
    const result = detectPatterns('', '', 'DECISIONS.md tracks all decisions', null);
    expect(result.categories.gsd).toContain('DECISIONS');
  });

  it('detects UAT from content', () => {
    const result = detectPatterns('', '', 'UAT test results', null);
    expect(result.categories.gsd).toContain('UAT');
  });

  it('detects KNOWLEDGE from content', () => {
    const result = detectPatterns('', '', 'KNOWLEDGE base for GSD', null);
    expect(result.categories.gsd).toContain('KNOWLEDGE');
  });
});

describe('getTopPatterns', () => {
  it('returns sorted patterns by count from results array', () => {
    const results = [
      { payload: { source: 'src/Button.tsx', summary: 'React component', content: null, tags: null } },
      { payload: { source: 'src/Card.tsx', summary: 'React UI', content: null, tags: null } },
      { payload: { source: 'src/List.tsx', summary: 'React list', content: null, tags: null } },
      { payload: { source: 'src/server.ts', summary: 'Express API', content: 'import express', tags: null } },
    ];
    const result = getTopPatterns(results);
    expect(result.categories.frontend).toBeDefined();
    expect(result.categories.frontend[0].label).toBe('React');
    expect(result.categories.frontend[0].count).toBe(3);
    expect(result.categories.backend[0].label).toBe('Express');
    expect(result.categories.backend[0].count).toBe(1);
  });

  it('returns empty categories for empty array', () => {
    const result = getTopPatterns([]);
    expect(result.categories).toEqual({});
  });

  it('handles array with null entries', () => {
    const result = getTopPatterns([null, null]);
    expect(result.categories).toEqual({});
  });

  it('handles array with undefined entries', () => {
    const result = getTopPatterns([undefined]);
    expect(result.categories).toEqual({});
  });

  it('handles results without payload field (uses result directly)', () => {
    const results = [
      { source: 'src/Button.tsx', summary: 'React component', content: null, tags: null },
    ];
    const result = getTopPatterns(results);
    expect(result.categories.frontend).toContainEqual({ label: 'React', count: 1 });
  });

  it('aggregates counts across multiple results', () => {
    const results = [
      { payload: { source: 'a.tsx', summary: '', content: null, tags: null } },
      { payload: { source: 'b.tsx', summary: '', content: null, tags: null } },
      { payload: { source: 'c.ts', summary: '', content: null, tags: null } },
    ];
    const result = getTopPatterns(results);
    expect(result.categories.framework[0].count).toBe(3); // TypeScript from .tsx + .ts
  });

  it('handles null results array', () => {
    const result = getTopPatterns(null);
    expect(result.categories).toEqual({});
  });

  it('handles results with payload containing empty strings', () => {
    const result = getTopPatterns([
      { payload: { source: '', summary: '', content: '', tags: '' } },
    ]);
    expect(result.categories).toEqual({});
  });
});
