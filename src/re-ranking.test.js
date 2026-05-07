import { describe, it, expect, vi } from 'vitest';

const {
  applySymbolBoost,
  extractTokens,
  sourceToTokens,
  calculateSourceTokenOverlapScore,
  calculateLexicalSignal,
  estimateTokens,
  trimResultsByTokenBudget
} = require('./re-ranking');

describe('extractTokens', () => {
  it('estrae token da query multi-parola filtrando stopwords', () => {
    const tokens = extractTokens('implementare checkout');
    expect(tokens).toEqual(['implementare', 'checkout']);
  });

  it('filtra stopwords inglesi e italiane', () => {
    const tokens = extractTokens('the is a query for results in the database');
    expect(tokens).toContain('query');
    expect(tokens).toContain('results');
    expect(tokens).toContain('database');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('is');
    expect(tokens).not.toContain('for');
  });

  it('filtra token corti (<2 caratteri)', () => {
    const tokens = extractTokens('a b c query test');
    expect(tokens).toEqual(['query', 'test']);
  });

  it('gestisce input vuoto e null', () => {
    expect(extractTokens('')).toEqual([]);
    expect(extractTokens(null)).toEqual([]);
    expect(extractTokens(undefined)).toEqual([]);
  });

  it('normalizza a lowercase', () => {
    const tokens = extractTokens('IMPLEMENTARE CHECKOUT');
    expect(tokens).toContain('implementare');
    expect(tokens).toContain('checkout');
  });

  it('split su hyphen, underscore e punti', () => {
    const tokens = extractTokens('build-code-text_and_more.jsx');
    expect(tokens).toContain('build');
    expect(tokens).toContain('code');
    expect(tokens).toContain('jsx');
  });

  it('splitta CamelCase in token separati', () => {
    const tokens = extractTokens('ProjectCard ReactCard');
    expect(tokens).toContain('project');
    expect(tokens).toContain('card');
    expect(tokens).toContain('react');
  });

  it('query con solo stopwords → array vuoto', () => {
    const tokens = extractTokens('the is a of in for on with');
    expect(tokens).toEqual([]);
  });
});

describe('applySymbolBoost', () => {
  it('boosta risultati con symbolName che contiene un token della query (substring match)', () => {
    const results = [
      { score: 0.5, symbolNames: ['buildCodeText'] },
      { score: 0.7, symbolNames: ['otherFunction'] }
    ];

    applySymbolBoost(results, 'implementare build');

    expect(results[0].score).toBeCloseTo(0.75);
    expect(results[1].score).toBeCloseTo(0.7);
  });

  it('boosta con match esatto del token intero', () => {
    const results = [
      { score: 0.6, symbolNames: ['extractTokens'] }
    ];

    applySymbolBoost(results, 'token extraction');

    expect(results[0].score).toBeCloseTo(0.9);
  });

  it('non modifica risultati senza symbolNames', () => {
    const results = [
      { score: 0.8, name: 'noSymbols' }
    ];

    applySymbolBoost(results, 'implementare');

    expect(results[0].score).toBeCloseTo(0.8);
  });

  it('gestisce symbolNames come array vuoto', () => {
    const results = [
      { score: 0.5, symbolNames: [] }
    ];

    applySymbolBoost(results, 'implementare');

    expect(results[0].score).toBeCloseTo(0.5);
  });

  it('gestisce symbolNames null', () => {
    const results = [
      { score: 0.5, symbolNames: null }
    ];

    applySymbolBoost(results, 'implementare');

    expect(results[0].score).toBeCloseTo(0.5);
  });

  it('gestisce risultati con score non numerico', () => {
    const results = [
      { score: 'invalid', symbolNames: ['test'] }
    ];

    applySymbolBoost(results, 'implementare');

    expect(results[0].score).toBe('invalid');
  });

  it('boosta multipli risultati con match diversi', () => {
    const results = [
      { score: 0.4, symbolNames: ['buildCodeText'] },
      { score: 0.6, symbolNames: ['extractTokens'] },
      { score: 0.8, symbolNames: ['helperFunction'] }
    ];

    applySymbolBoost(results, 'implementare build extract');

    expect(results[0].score).toBeCloseTo(0.6);
    expect(results[1].score).toBeCloseTo(0.9);
    expect(results[2].score).toBeCloseTo(0.8);
  });

  it('è case insensitive', () => {
    const results = [
      { score: 0.5, symbolNames: ['buildCodeText'] }
    ];

    applySymbolBoost(results, 'IMPLEMENTARE BUILDCODETEXT');

    expect(results[0].score).toBeCloseTo(0.75);
  });

  it('non boosta quando la query contiene solo stopwords', () => {
    const results = [
      { score: 0.5, symbolNames: ['buildCodeText'] }
    ];

    applySymbolBoost(results, 'the is a of in for on with');

    expect(results[0].score).toBeCloseTo(0.5);
  });

  it('ritorna results invariato se input vuoto', () => {
    expect(applySymbolBoost([], 'query')).toEqual([]);
    expect(applySymbolBoost(null, 'query')).toBeNull();
    const r = [{ score: 0.5 }];
    applySymbolBoost(r, '');
    expect(r[0].score).toBeCloseTo(0.5);
    applySymbolBoost([{ score: 0.5 }], null);
  });

  it('boost delta ≈ +0.2 nel range [0,1] (×1.5 multiplier)', () => {
    const results = [{ score: 0.4, symbolNames: ['buildCodeText'] }];

    applySymbolBoost(results, 'implementare build');

    const delta = results[0].score - 0.4;
    expect(delta).toBeCloseTo(0.2, 1);
  });

  it('muta l\'array in place (stesso riferimento)', () => {
    const results = [{ score: 0.5, symbolNames: ['test'] }];
    const returned = applySymbolBoost(results, 'implementare test');

    expect(returned).toBe(results);
  });

  it('aggiunge boost sul source path quando il basename corrisponde ai token query', () => {
    const results = [
      { score: 0.52, source: 'apps/web/src/components/ProjectCard.jsx', symbolNames: [] },
      { score: 0.7, source: 'apps/web/src/components/Layout.jsx', symbolNames: [] }
    ];

    applySymbolBoost(results, 'react card');

    expect(results[0].score).toBeCloseTo(0.6, 5);
    expect(results[1].score).toBeCloseTo(0.7, 5);
  });

  it('combina symbol boost e source boost sul componente giusto', () => {
    const results = [
      { score: 0.5, source: 'apps/web/src/components/ProjectCard.jsx', symbolNames: ['ProjectCard'] }
    ];

    applySymbolBoost(results, 'project card');

    expect(results[0].score).toBeCloseTo(0.95, 5);
  });

  it('logga il numero di risultati boostati', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const results = [
      { score: 0.5, source: 'apps/web/src/components/buildCodeText.js', symbolNames: ['buildCodeText'] },
      { score: 0.6, source: 'apps/web/src/utils/extractTokens.js', symbolNames: ['extractTokens'] }
    ];

    applySymbolBoost(results, 'implementare build extract');

    expect(consoleSpy).toHaveBeenCalledWith('[retrieval] symbolBoost: %d results, sourceBoost: %d results', 2, 2);
    consoleSpy.mockRestore();
  });
});

describe('calculateLexicalSignal', () => {
  it('espone il segnale lessicale utile per rescue pre-threshold', () => {
    const signal = calculateLexicalSignal(
      {
        score: 0.41,
        source: 'apps/web/src/components/ProjectCard.jsx',
        symbolNames: ['ProjectCard']
      },
      'project card react'
    );

    expect(signal.symbolMultiplier).toBe(1.5);
    expect(signal.sourceBoost).toBeCloseTo(0.16, 5);
    expect(signal.matchedSymbols).toBe(2);
    expect(signal.matchedSourceTokens).toBe(2);
  });

  it('non segnala rescue quando non c\'è match utile', () => {
    const signal = calculateLexicalSignal(
      {
        score: 0.41,
        source: 'apps/web/src/components/Layout.jsx',
        symbolNames: ['Layout']
      },
      'react card'
    );

    expect(signal.symbolMultiplier).toBe(1);
    expect(signal.sourceBoost).toBe(0);
    expect(signal.matchedSymbols).toBe(0);
    expect(signal.matchedSourceTokens).toBe(0);
  });
});

describe('sourceToTokens / calculateSourceTokenOverlapScore', () => {
  it('estrae token semantici dal source path con CamelCase', () => {
    const tokens = sourceToTokens('apps/web/src/components/ProjectCard.jsx');
    expect(tokens).toContain('project');
    expect(tokens).toContain('card');
    expect(tokens).toContain('components');
  });

  it('assegna boost parziale quando solo parte dei token query è nel path', () => {
    const boost = calculateSourceTokenOverlapScore('apps/web/src/components/ProjectCard.jsx', ['react', 'card']);
    expect(boost).toBeCloseTo(0.08, 5);
  });

  it('assegna boost maggiore quando tutti i token presenti nel path combaciano', () => {
    const boost = calculateSourceTokenOverlapScore('apps/web/src/components/ReactCard.jsx', ['react', 'card']);
    expect(boost).toBeCloseTo(0.2, 5);
  });
});

describe('estimateTokens', () => {
  it('stima token come length/4 arrotondato per eccesso', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  it('codice più lungo → più token stimati', () => {
    const short = 'x';
    const long = 'function buildCodeText() { return "hello"; }';
    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
  });
});

describe('trimResultsByTokenBudget', () => {
  it('non tronca se sotto il budget token', () => {
    const results = [
      { score: 0.8, content: 'short text' },
      { score: 0.6, summary: 'brief summary' }
    ];

    const info = trimResultsByTokenBudget(results, { maxTokens: 4000 });

    expect(info.trimmed).toBe(false);
    expect(info.originalCount).toBe(2);
    expect(info.finalCount).toBe(2);
  });

  it('tronca content e text se supera il budget', () => {
    const longContent = 'x'.repeat(1000);
    const results = [
      { score: 0.8, content: longContent },
      { score: 0.6, summary: longContent }
    ];

    const info = trimResultsByTokenBudget(results, { maxTokens: 100 });

    expect(info.trimmed).toBe(true);
    for (const r of results) {
      if (r.content && r._truncated) {
        expect(r.content.length).toBeLessThanOrEqual(500);
      }
    }
  });

  it('gestisce array vuoto', () => {
    const info = trimResultsByTokenBudget([], { maxTokens: 4000 });
    expect(info.trimmed).toBe(false);
    expect(info.originalCount).toBe(0);
  });

  it('ignora risultati null nell\'array', () => {
    const results = [null, { score: 0.8, content: 'test' }, null];
    const info = trimResultsByTokenBudget(results, { maxTokens: 4000 });
    expect(info.finalCount).toBe(3);
  });

  it('aggiunge flag _truncated ai campi troncati', () => {
    const longContent = 'x'.repeat(1000);
    const results = [{ score: 0.8, content: longContent }];

    trimResultsByTokenBudget(results, { maxTokens: 50 });

    expect(results[0]._truncated).toBe(true);
  });
});
