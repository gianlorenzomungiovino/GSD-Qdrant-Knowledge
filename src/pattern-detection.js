/**
 * Pattern Detection Module
 *
 * Identifies technology patterns in source paths, summaries, content, and tags
 * to enable highlighted technology display in CLI output tables.
 *
 * Categories: frontend, backend, runtime, testing, build, framework, database, infrastructure
 */

// ─── Pattern Database ──────────────────────────────────────────────────

const PATTERN_DB = {
  frontend: [
    { pattern: /react/i, label: 'React' },
    { pattern: /next\.?js/i, label: 'Next.js' },
    { pattern: /vue(\.js)?/i, label: 'Vue' },
    { pattern: /nuxt(\.js)?/i, label: 'Nuxt' },
    { pattern: /angular/i, label: 'Angular' },
    { pattern: /svelte(\.js)?/i, label: 'Svelte' },
  ],
  backend: [
    { pattern: /express(\.js)?/i, label: 'Express' },
    { pattern: /fastify/i, label: 'Fastify' },
    { pattern: /nestjs/i, label: 'NestJS' },
  ],
  runtime: [
    { pattern: /node_modules|nodejs|node\.js|server\.(js|ts)|bin\/|\.bin\//i, label: 'Node.js' },
    { pattern: /next\.config|middleware\.(js|ts)|\.next\//i, label: 'Next.js/Node' },
    { pattern: /require\s*\(|module\.exports\s*=|process\.(env|cwd|exit)/i, label: 'Node.js' },
  ],
  testing: [
    { pattern: /jest/i, label: 'Jest' },
    { pattern: /vitest/i, label: 'Vitest' },
    { pattern: /cypress/i, label: 'Cypress' },
  ],
  build: [
    { pattern: /webpack/i, label: 'Webpack' },
    { pattern: /vite(\.js)?/i, label: 'Vite' },
    { pattern: /rollup/i, label: 'Rollup' },
    { pattern: /turborepo/i, label: 'Turborepo' },
  ],
  framework: [
    { pattern: /typescript/i, label: 'TypeScript' },
    { pattern: /\.tsx?$/i, label: 'TypeScript' },
  ],
  database: [
    { pattern: /postgresql|postgres/i, label: 'PostgreSQL' },
    { pattern: /redis/i, label: 'Redis' },
    { pattern: /mongodb|mongo/i, label: 'MongoDB' },
  ],
  infrastructure: [
    { pattern: /docker/i, label: 'Docker' },
  ],
  gsd: [
    { pattern: /ROADMAP/i, label: 'ROADMAP' },
    { pattern: /CONTEXT/i, label: 'CONTEXT' },
    { pattern: /UAT/i, label: 'UAT' },
    { pattern: /DECISIONS/i, label: 'DECISIONS' },
    { pattern: /KNOWLEDGE/i, label: 'KNOWLEDGE' },
    { pattern: /STATE(\.md)?$/i, label: 'STATE' },
  ],
};

// ─── detectPatterns ────────────────────────────────────────────────────

/**
 * Analyze source path, summary, content, and tags to detect technology patterns.
 *
 * @param {string} source   - Source file path (e.g. 'src/components/Button.tsx')
 * @param {string} summary  - Summary text of the result
 * @param {string|null} content - Full content text (may be null)
 * @param {string|string[]|null} tags - Tags array or comma-separated string (may be null)
 * @returns {{ categories: { [category: string]: string[] } }}
 */
function detectPatterns(source, summary, content, tags) {
  const found = {}; // { [category]: Set<label> }

  // Normalize inputs to strings
  const sourceStr = typeof source === 'string' ? source : '';
  const summaryStr = typeof summary === 'string' ? summary : '';
  const contentStr = typeof content === 'string' ? content : '';
  const tagsStr = Array.isArray(tags) ? tags.join(' ') : typeof tags === 'string' ? tags : '';

  // Combine all text fields for scanning
  const texts = [sourceStr, summaryStr, contentStr, tagsStr].filter(Boolean);

  // Scan each category
  for (const [category, patterns] of Object.entries(PATTERN_DB)) {
    const matchedLabels = new Set();

    for (const { pattern, label } of patterns) {
      for (const text of texts) {
        if (typeof pattern === 'string') {
          if (text.toLowerCase().includes(pattern.toLowerCase())) {
            matchedLabels.add(label);
            break;
          }
        } else {
          if (pattern.test(text)) {
            matchedLabels.add(label);
            break;
          }
        }
      }
    }

    if (matchedLabels.size > 0) {
      found[category] = Array.from(matchedLabels);
    }
  }

  return { categories: found };
}

// ─── getTopPatterns ────────────────────────────────────────────────────

/**
 * Aggregate patterns from multiple results and return the most frequent ones with counts.
 *
 * @param {Array<object>} results - Array of result objects, each with a `payload` field
 * @returns {{ categories: { [category: string]: { label: string, count: number }[] } }}
 */
function getTopPatterns(results) {
  if (!results || !Array.isArray(results)) {
    return { categories: {} };
  }

  const categoryLabelCounts = {}; // { [category]: { [label]: count } }

  for (const result of results) {
    const payload = result && result.payload ? result.payload : result;
    if (!payload) continue;

    const detection = detectPatterns(
      payload.source || '',
      payload.summary || '',
      payload.content || null,
      payload.tags || null
    );

    for (const [category, labels] of Object.entries(detection.categories)) {
      if (!categoryLabelCounts[category]) {
        categoryLabelCounts[category] = {};
      }
      for (const label of labels) {
        categoryLabelCounts[category][label] = (categoryLabelCounts[category][label] || 0) + 1;
      }
    }
  }

  // Convert counts to sorted arrays
  const categories = {};
  for (const [category, labelCounts] of Object.entries(categoryLabelCounts)) {
    categories[category] = Object.entries(labelCounts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  return { categories };
}

module.exports = {
  PATTERN_DB,
  detectPatterns,
  getTopPatterns,
};
