/**
 * Re-ranking Module
 *
 * Applies recency boost, path matching, and symbol/source name boosting to Qdrant search results.
 * Results with recent lastModified timestamps get a +0.05 score boost,
 * results whose source paths contain query words get an additional +0.15 boost,
 * and results containing exact token matches on symbolNames get a ×1.5 score multiplier.
 */


function extractTokens(query) {
  if (!query || typeof query !== 'string') return [];

  const normalized = query
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();

  const tokens = normalized.split(/[\s\-_/\\.]+/);
  return tokens.filter(t => t.length >= 2);
}

function sourceToTokens(source) {
  if (!source || typeof source !== 'string') return [];

  const normalized = source
    .replace(/\\/g, '/')
    .split('/')
    .join(' ')
    .replace(/\.[a-z0-9]+$/i, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();

  return normalized
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function calculateSourceTokenOverlapScore(source, queryTokens) {
  if (!source || !Array.isArray(queryTokens) || queryTokens.length === 0) return 0;

  const sourceTokens = new Set(sourceToTokens(source));
  if (sourceTokens.size === 0) return 0;

  let matched = 0;
  for (const token of queryTokens) {
    if (sourceTokens.has(token)) matched++;
  }

  if (matched === 0) return 0;
  if (matched === queryTokens.length) return 0.2;
  return 0.08 * matched;
}

function calculateLexicalSignal(result, rawQuery) {
  if (!result || typeof result.score !== 'number' || !rawQuery || typeof rawQuery !== 'string') {
    return { symbolMultiplier: 1, sourceBoost: 0, matchedSymbols: 0, matchedSourceTokens: 0 };
  }

  const tokens = extractTokens(rawQuery);
  if (tokens.length === 0) {
    return { symbolMultiplier: 1, sourceBoost: 0, matchedSymbols: 0, matchedSourceTokens: 0 };
  }

  const symbols = Array.isArray(result.symbolNames) ? result.symbolNames : [];
  let matchedSymbols = 0;

  for (const token of tokens) {
    for (const sym of symbols) {
      if (typeof sym === 'string' && sym.toLowerCase().includes(token)) {
        matchedSymbols++;
        break;
      }
    }
  }

  const sourceTokens = new Set(sourceToTokens(result.source));
  let matchedSourceTokens = 0;
  for (const token of tokens) {
    if (sourceTokens.has(token)) matchedSourceTokens++;
  }

  return {
    symbolMultiplier: matchedSymbols > 0 ? 1.5 : 1,
    sourceBoost: calculateSourceTokenOverlapScore(result.source, tokens),
    matchedSymbols,
    matchedSourceTokens,
  };
}

function applySymbolBoost(results, rawQuery) {
  if (!results || results.length === 0 || !rawQuery || typeof rawQuery !== 'string') return results;

  let boostedCount = 0;
  let sourceBoostedCount = 0;

  for (const result of results) {
    if (!result || typeof result.score !== 'number') continue;

    const signal = calculateLexicalSignal(result, rawQuery);

    if (signal.symbolMultiplier > 1) {
      result.score *= signal.symbolMultiplier;
      boostedCount++;
    }

    if (signal.sourceBoost > 0) {
      result.score = Math.min(1.0, result.score + signal.sourceBoost);
      sourceBoostedCount++;
    }
  }

  return results;
}

function applyRecencyBoost(results, optionsOrDays = 30, rawQuery) {
  let days;
  let enablePathMatch = true;

  if (typeof optionsOrDays === 'object') {
    days = typeof optionsOrDays.days === 'number' ? optionsOrDays.days : 30;
    enablePathMatch = optionsOrDays.pathMatch !== false;
  } else {
    days = Number(optionsOrDays) || 30;
  }

  if (!results || results.length === 0) return results;

  const query = (rawQuery && rawQuery.trim())
    ? rawQuery.trim()
    : (results[0] && typeof results[0]._query === 'string' ? results[0]._query : '');

  const now = Date.now();
  const recentCutoffMs = now - days * 86400000;

  let totalBoost = 0;

  for (const result of results) {
    if (!result || typeof result.score !== 'number') continue;

    let boost = 0;

    const lastMod = result.lastModified ? parseInt(result.lastModified, 10) : null;
    if (lastMod && lastMod * 1000 > recentCutoffMs) {
      boost += 0.05;
    }

    if (enablePathMatch && result.source && query.length >= 3) {
      const lowerSource = String(result.source).toLowerCase();
      const words = query.split(/\s+/).filter(w => w.length >= 3);

      for (const word of words) {
        if (lowerSource.includes(word.toLowerCase())) {
          boost += 0.15;
          break;
        }
      }
    }

    totalBoost += boost;
    result.score = Math.min(1.0, result.score + boost);
  }

  return results;
}

function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

function trimResultsByTokenBudget(results, options = {}) {
  const maxTokens = typeof options.maxTokens === 'number' ? options.maxTokens : 4000;
  const maxCharsPerResult = typeof options.maxCharsPerResult === 'number' ? options.maxCharsPerResult : 500;

  if (!results || results.length === 0) {
    return { trimmed: false, originalCount: 0, finalCount: 0 };
  }

  let totalTokens = 0;
  for (const r of results) {
    if (!r) continue;
    const textFields = [r.content, r.summary, r.text].filter(Boolean);
    for (const field of textFields) {
      totalTokens += estimateTokens(field);
    }
  }

  if (totalTokens <= maxTokens) {
    return { trimmed: false, originalCount: results.length, finalCount: results.length };
  }

  const originalCount = results.length;

  for (const r of results) {
    if (!r) continue;
    if (r.content && r.content.length > maxCharsPerResult) {
      r.content = r.content.slice(0, maxCharsPerResult);
      r._truncated = true;
    }
    if (r.text && r.text.length > maxCharsPerResult) {
      r.text = r.text.slice(0, maxCharsPerResult);
      r._truncated = true;
    }
  }

  return { trimmed: true, originalCount, finalCount: results.length };
}

/**
 * Sort search results: different files keep score order (desc), same file sorts by startLine asc.
 * Used by both cli.js (context command) and gsd-qdrant-mcp/index.js (auto_retrieve tool).
 * @param {Array} hits - Array of Qdrant hit objects with payload containing startLine, chunkIndex, _parent_file
 * @returns {Array} Sorted hits
 */
function sortChunksByPosition(hits) {
  return [...hits].sort((a, b) => {
    const parentIdA = a.payload?._parent_file || '';
    const parentIdB = b.payload?._parent_file || '';

    // Different files: keep score order (descending by score)
    if (parentIdA !== parentIdB) return b.score - a.score;

    // Same file: sort by startLine ascending, then chunkIndex as tiebreaker
    const lineA = a.payload?.startLine ?? 0;
    const lineB = b.payload?.startLine ?? 0;
    if (lineA !== lineB) return lineA - lineB;

    // Fallback to chunkIndex for same-line chunks
    const idxA = a.payload?.chunkIndex ?? 0;
    const idxB = b.payload?.chunkIndex ?? 0;
    return idxA - idxB;
  });
}

/**
 * Format search results for output: token estimation, trimming, and cleanup.
 * Shared logic between cli.js (context command) and gsd-qdrant-mcp/index.js (auto_retrieve).
 * @param {Array} ranked - Ranked result objects
 * @param {object} options - Configuration
 * @param {number} options.maxTokens - Token budget (default 4000)
 * @param {number} options.maxCharsPerResult - Max chars per result (default 500)
 * @returns {{ results: Array, trimmedInfo: object|null }} Formatted results and trim info
 */
function formatResultsForOutput(ranked, options = {}) {
  const maxTokens = typeof options.maxTokens === 'number' ? options.maxTokens : 4000;
  const maxCharsPerResult = typeof options.maxCharsPerResult === 'number' ? options.maxCharsPerResult : 500;

  // Token estimation
  let totalTokens = 0;
  for (const r of ranked) {
    if (!r) continue;
    const textFields = [r.content, r.summary, r.text].filter(Boolean);
    for (const field of textFields) {
      totalTokens += estimateTokens(field);
    }
  }

  // Trim results if over token budget
  let trimmedInfo = null;
  try {
    trimmedInfo = trimResultsByTokenBudget(ranked, { maxTokens, maxCharsPerResult });
  } catch (_) { /* non-fatal — proceed with untrimmed */ }

  // Clean up internal _truncated flag before output
  for (const r of ranked) {
    if (r && '_truncated' in r) delete r._truncated;
  }

  return { results: ranked, trimmedInfo, totalTokens };
}

/**
 * Calculate a composite relevance score from similarity, recency, importance, and project boosts.
 *
 * Formula: 0.6 × similarity + 0.15 × recency + 0.05 × importance + reusableBoost + crossProjectBoost + sameProjectBoost
 *
 * - similarity: base semantic search score (0–1)
 * - recency: 1 − min(1, ageInDays / 30), where ageInDays = (now − timestampMs) / 86400000
 * - importance: (importanceValue / 5), clamped to [0, 1]
 * - reusableBoost: +0.08 if reusable === true
 * - crossProjectBoost: +0.06 if project_id differs from the caller's projectId
 * - sameProjectBoost: +0.04 if project_id matches the caller's projectId
 *
 * Used by both CLI (context command) and MCP (auto_retrieve tool) for unified ranking.
 *
 * @param {object} params
 * @param {number} params.similarity - Base semantic score (0–1)
 * @param {number} params.timestamp - lastModified timestamp in milliseconds
 * @param {number} [params.importance] - Importance value 1–5 (default 1)
 * @param {boolean} [params.reusable] - Whether the result is marked reusable (default false)
 * @param {string} [params.projectId] - Project ID of the result
 * @param {string} [params.callerProjectId] - Project ID of the caller (for cross/same-project boost)
 * @returns {number} Composite score clamped to [0, 1]
 */
function calculateCompositeScore({
  similarity,
  timestamp,
  importance = 1,
  reusable = false,
  projectId,
  callerProjectId,
}) {
  const now = Date.now();

  // Base similarity (0–1)
  const sim = Math.max(0, Math.min(1, Number(similarity) || 0));

  // Recency: 1 − min(1, ageInDays / 30)
  const ts = timestamp != null ? Number(timestamp) : now;
  const ageMs = now - ts;
  const ageInDays = Math.max(0, ageMs / 86400000);
  const recency = Math.max(0, Math.min(1, 1 - ageInDays / 30));

  // Importance: (value / 5), clamped to [0, 1]
  const imp = Math.max(0, Math.min(1, Number(importance) / 5));

  // Boosts
  const reusableBoost = reusable ? 0.08 : 0;
  const crossProjectBoost = projectId && projectId !== callerProjectId ? 0.06 : 0;
  const sameProjectBoost = projectId && projectId === callerProjectId ? 0.04 : 0;

  // Composite score
  const score = sim * 0.6 + recency * 0.15 + imp * 0.05 + reusableBoost + crossProjectBoost + sameProjectBoost;

  return Math.max(0, Math.min(1, score));
}

/**
 * Format search results as a markdown table for CLI output.
 *
 * Produces a structured output with:
 * - Header line showing detected patterns in bold
 * - Markdown table with columns: File | Descrizione | Progetto | Tecnica
 * - Footer sections (### File) with truncated content snippets
 *
 * @param {Array} rankedResults - Ranked result objects (each with source, summary, project_id, type, language, content, score)
 * @param {object} topPatterns - Pattern detection result { categories: { [category]: [label] } }
 * @returns {{ header: string, table: string, footers: string }} Formatted output components
 */
function formatResultsForTable(rankedResults, topPatterns) {
  // ── Header: detected patterns in bold ──────────────────────────────
  let header = '';
  try {
    const cats = topPatterns && topPatterns.categories ? topPatterns.categories : {};
    const allLabels = Object.values(cats).flatMap(arr =>
      Array.isArray(arr) ? arr.map(item => typeof item === 'string' ? item : item.label) : []
    );
    if (allLabels.length > 0) {
      header = '**Pattern rilevati:** ' + allLabels.join(', ') + '\n\n';
    }
  } catch (_) { /* non-fatal — proceed without header */ }

  // ── Table: File | Descrizione | Progetto | Tecnica ────────────────────
  let table = '| File | Descrizione | Progetto | Tecnica |\n';
  table += '|------|-----------|----------|---------|\n';

  try {
    if (!rankedResults || !Array.isArray(rankedResults)) {
      table += '| — | — | — | — |\n';
    } else {
      for (const result of rankedResults) {
        if (!result) {
          table += '| — | — | — | — |\n';
          continue;
        }

        // File: source path as relative markdown link
        const source = result.source || '—';
        const fileLink = source !== '—'
          ? `[${source}](#${source.replace(/[^a-zA-Z0-9]/g, '_')})`
          : '—';

        // Descrizione: summary truncated to ~80 chars
        const summary = result.summary || '—';
        const desc = summary.length > 80 ? summary.slice(0, 77) + '...' : summary;

        // Progetto: project_id or '—'
        const project = result.project_id || '—';

        // Tecnica: type/language (e.g. 'code/TypeScript', 'doc/markdown')
        const type = result.type || 'unknown';
        const language = result.language || '';
        const technique = language ? `${type}/${language}` : type;

        table += `| ${fileLink} | ${desc} | ${project} | ${technique} |\n`;
      }
    }
  } catch (_) { /* non-fatal — table already has header */ }

  table += '\n';

  // ── Footers: ### File sections with truncated content ──────────────
  let footers = '';
  try {
    if (rankedResults && Array.isArray(rankedResults)) {
      for (let i = 0; i < rankedResults.length; i++) {
        const result = rankedResults[i];
        if (!result) continue;

        const source = result.source || `risultato_${i + 1}`;
        footers += `### ${source}\n\n`;

        const content = result.content || '';
        if (content) {
          const snippet = content.length > 200 ? content.slice(0, 197) + '...' : content;
          footers += snippet + '\n\n';
        }
      }
    }
  } catch (_) { /* non-fatal */ }

  return { header, table, footers };
}

/**
 * Format related concepts and documentation as markdown sections for CLI output.
 *
 * Produces:
 *   - "## Concetti correlati" with a numbered list (when concepts array is non-empty)
 *   - "## Documentazione correlata" with grouped doc entries (when relatedDocs array is non-empty)
 *
 * Each section is wrapped in try/catch so a formatting error in one does not
 * prevent the other from rendering.  Long descriptions are truncated to 120 chars.
 *
 * @param {Array<Object>|null|undefined} concepts — related concepts from findRelatedConcepts: [{name, description, source, score}, ...]
 * @param {Array<Object>|null|undefined} relatedDocs — related docs from findRelatedDocs: [{ids, docPaths, descriptions}, ...]
 * @returns {string} markdown-formatted sections or empty string when both inputs are empty
 */
function formatConceptsSection(concepts, relatedDocs) {
  const conceptList = Array.isArray(concepts) ? concepts : [];
  const docGroups = Array.isArray(relatedDocs) ? relatedDocs : [];

  // If both arrays are empty, return early
  if (conceptList.length === 0 && docGroups.length === 0) {
    return '';
  }

  let output = '';

  // ── Concepts section ─────────────────────────────────────────────────
  try {
    if (conceptList.length > 0) {
      output += '\n## Concetti correlati\n\n';
      for (let i = 0; i < conceptList.length; i++) {
        const c = conceptList[i];
        if (!c) continue;

        const name = c.name || c.source || 'Concetto sconosciuto';
        let description = c.description || '—';
        // Truncate long descriptions to 120 chars
        if (description.length > 120) {
          description = description.slice(0, 117) + '...';
        }
        const source = c.source || '—';
        const score = typeof c.score === 'number' ? c.score.toFixed(2) : 'N/A';

        output += `${i + 1}. **${name}** — ${description}\n   - Source: ${source} (score: ${score})\n\n`;
      }
    }
  } catch (err) {
    // Silent failure — concepts section omitted on error
  }

  // ── Documentation section ────────────────────────────────────────────
  try {
    if (docGroups.length > 0) {
      output += '\n## Documentazione correlata\n\n';
      for (const group of docGroups) {
        if (!group) continue;

        // GSD IDs: M001, S01, T02, etc.
        const ids = group.ids || group.id || group.sharedIds || [];
        const idsText = Array.isArray(ids) ? ids.join(', ') : String(ids);
        output += `### GSD IDs: ${idsText}\n\n`;

        // Doc paths with descriptions
        const docPaths = group.docPaths || group.sources || group.paths || [];
        const descriptions = group.descriptions || group.titles || [];

        if (Array.isArray(docPaths)) {
          for (let i = 0; i < docPaths.length; i++) {
            const path = docPaths[i] || '—';
            const desc = Array.isArray(descriptions) && descriptions[i]
              ? descriptions[i]
              : '';
            const entry = desc ? `${path} — ${desc}` : path;
            output += `- ${entry}\n`;
          }
        } else if (docPaths) {
          output += `- ${docPaths}\n`;
        }

        output += '\n';
      }
    }
  } catch (err) {
    // Silent failure — docs section omitted on error
  }

  return output;
}

module.exports = {
  applyRecencyBoost,
  applySymbolBoost,
  calculateCompositeScore,
  calculateLexicalSignal,
  estimateTokens,
  trimResultsByTokenBudget,
  sortChunksByPosition,
  formatResultsForOutput,
  formatResultsForTable,
  formatConceptsSection
};
