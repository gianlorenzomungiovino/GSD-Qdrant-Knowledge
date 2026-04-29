#!/usr/bin/env node

/**
 * Knowledge Instructions Installer
 *
 * Writes auto-retrieve instructions for the GSD agent into project-level
 * KNOWLEDGE.md. This file is loaded automatically by GSD (pi) and injected
 * into the system prompt on every turn.
 *
 * Installation is safe-to-run-multiple-times: uses marker-based dedup with
 * version-aware patching to avoid duplication and update only the Qdrant
 * section when the package.json version changes. Other content in the file
 * is preserved.
 *
 * Target file:
 *   - <cwd>/.gsd/KNOWLEDGE.md   (project-level — loaded by GSD/pi)
 */

const { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } = require('fs');
const { join, dirname } = require('path');

const SECTION_MARKER = '## Cross-Project Knowledge Retrieval (Qdrant)';
const VERSION_PREFIX = '# GSD-QDRANT-TEMPLATE-VERSION: ';

const SECTION_CONTENT = `
${SECTION_MARKER}

GSD-Qdrant is installed in this project. When working on this project, use auto_retrieve to query cross-project knowledge from the unified Qdrant vector database via MCP.

### When to call auto_retrieve

**Always call \`auto_retrieve\` before or alongside local searches for:**
- Questions about libraries, frameworks, components, or technologies ("che componenti frontend posso usare?", "come si usa X?", "quali librerie per Y?")
- API usage questions (method signatures, configuration options)
- Design patterns or architectural approaches

**Always call \`auto_retrieve\` as a fallback when:**
- Local search in the codebase returns no relevant results for your query
- You're asking about something that might exist in other GSD projects but not in the current one

### How to use
Call the \`auto_retrieve\` tool (available via the \`gsd-qdrant\` MCP server) with your task description:

\`\`\`
auto_retrieve(
  task: "describe what you're working on",
  limit: 3,
  includeContent: false
)
\`\`\`

### Query formulation — extract key terms first
Before calling \`auto_retrieve\`, distill your question into **2-4 meaningful keywords** (no filler words). The embedding model scores best when the query is focused on concrete nouns/verbs.

| ❌ Bad | ✅ Good |
|---|---|
| "in base alle tue conoscenze, fai una ricerca su come possiamo implementare un carrello per un e commerce?" | "implementazione carrello ecommerce" |
| "come si usa React useEffect con cleanup function?" | "React useEffect cleanup pattern" |

The system will also extract keywords automatically as a fallback, but explicit extraction gives better results.

### Notes
- Results are ranked by semantic relevance + cross-project boost
- Prefer \`includeContent: true\` when you need the actual source content, not just summaries
- The MCP server must be running (configured in .mcp.json as \`gsd-qdrant\`)
`;

/**
 * Resolve target file path for knowledge instructions.
 *
 * Target:
 *   - <cwd>/.gsd/KNOWLEDGE.md   (project-level — loaded by GSD/pi)
 *
 * @param {string} cwd - Current working directory (project root)
 * @returns {{ knowledgePath: string }}
 */
function resolveKnowledgePaths(cwd) {
  return {
    knowledgePath: join(cwd, '.gsd', 'KNOWLEDGE.md'),
  };
}

/**
 * Extract the template version from file content.
 * Returns null if no version marker is found.
 */
function extractVersion(content) {
  const match = content.match(/# GSD-QDRANT-TEMPLATE-VERSION:\s*(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

/**
 * Replace the content starting from startMarker up to (but not including)
 * the next ## section heading. Preserves all other content in the file.
 *
 * @param {string} content - The full file content (should already have version markers stripped)
 * @param {string} startMarker - The opening marker
 * @param {string} replacement - The new content to insert (including the opening marker)
 * @returns {string} The updated content
 */
function replaceBetweenMarkers(content, startMarker, replacement) {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) return replacement;

  // Find the next section heading or end of file
  const afterStart = content.substring(startIndex + startMarker.length);
  const nextHeadingMatch = afterStart.match(/\n##\s+\S/);

  let endIndex;
  if (nextHeadingMatch) {
    endIndex = startIndex + startMarker.length + nextHeadingMatch.index;
  } else {
    endIndex = content.length;
  }

  return content.substring(0, startIndex) + replacement + content.substring(endIndex);
}

/**
 * Write instructions to KNOWLEDGE.md using marker-based dedup.
 *
 * @param {string} filePath - Path to the target file
 * @param {string} packageVersion - Current package version
 * @param {string} label - Display label for the file (e.g. "KNOWLEDGE.md")
 * @param {{ force?: boolean }} [options]
 * @returns {{ created: boolean, updated: boolean }}
 */
function writeInstructionsToFile(filePath, packageVersion, label, options = {}) {
  // Ensure directory exists
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let existingContent = '';
  if (existsSync(filePath)) {
    existingContent = readFileSync(filePath, 'utf-8');
  }

  const hasMarker = existingContent.includes(SECTION_MARKER);
  const installedVersion = extractVersion(existingContent);
  const needsUpdate = !hasMarker || installedVersion !== packageVersion || options.force;

  if (!needsUpdate) {
    console.log(`ℹ️  Auto-retrieve instructions already in ${label}`);
    return { created: false, updated: false };
  }

  if (hasMarker && installedVersion !== packageVersion) {
    // Strip ALL version marker lines first, then replace the section.
    const cleaned = existingContent.replace(
      /# GSD-QDRANT-TEMPLATE-VERSION: \d+\.\d+\.\d+\n?/g,
      ''
    );
    const newContent = replaceBetweenMarkers(
      cleaned,
      SECTION_MARKER,
      VERSION_PREFIX + packageVersion + '\n' + SECTION_CONTENT + '\n'
    );
    writeFileSync(filePath, newContent, 'utf-8');
    console.log(`📝 Updated: ${label} (Qdrant section v${installedVersion} → v${packageVersion})`);
    return { created: false, updated: true };
  }

  // Append instructions to existing content or create new file
  const newContent = existingContent + VERSION_PREFIX + packageVersion + '\n' + SECTION_CONTENT + '\n';
  writeFileSync(filePath, newContent, 'utf-8');
  console.log(`📝 Created: ${label} (auto-retrieve instructions)`);
  return { created: true, updated: false };
}

/**
 * Ensure auto-retrieve instructions are present in project-level KNOWLEDGE.md.
 *
 * @param {{ cwd?: string, force?: boolean }} [options]
 * @param {{ cwd?: string }} [options.cwd] - Project root directory (defaults to process.cwd())
 * @param {{ force?: boolean }} [options.force] - If true, always update even if versions match
 * @returns {{ knowledgeCreated: boolean, knowledgeUpdated: boolean }}
 */
function ensureKnowledgeInstructions(options = {}) {
  const cwd = options.cwd || process.cwd();

  // Read current package version from package.json (source of truth)
  let packageVersion;
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    packageVersion = pkg.version;
  } catch (_) {
    packageVersion = null;
  }

  const { knowledgePath } = resolveKnowledgePaths(cwd);

  const knowledgeResult = writeInstructionsToFile(knowledgePath, packageVersion, 'KNOWLEDGE.md', options);

  return {
    knowledgeCreated: knowledgeResult.created,
    knowledgeUpdated: knowledgeResult.updated,
  };
}

/**
 * Remove auto-retrieve instructions from a single file.
 * Only removes the Qdrant section (between markers), preserving all other content.
 *
 * @param {string} filePath - Path to the target file
 * @param {string} label - Display label for the file
 * @returns {{ removed: boolean, fileDeleted: boolean }}
 */
function removeInstructionsFromFile(filePath, label) {
  if (!existsSync(filePath)) {
    return { removed: false, fileDeleted: false };
  }

  let content = readFileSync(filePath, 'utf-8');
  const hasMarker = content.includes(SECTION_MARKER);

  if (!hasMarker) {
    return { removed: false, fileDeleted: false };
  }

  // Strip ALL version marker lines first
  const cleaned = content.replace(
    /# GSD-QDRANT-TEMPLATE-VERSION: \d+\.\d+\.\d+\n?/g,
    ''
  );

  // Remove the entire section
  const newContent = replaceBetweenMarkers(cleaned, SECTION_MARKER, '');

  // Clean up: remove leading/trailing blank lines if section was at the end
  const trimmed = newContent.replace(/^\n+/, '').replace(/\n+$/, '');

  if (trimmed) {
    // Section removed but file has other content — write back
    writeFileSync(filePath, trimmed + '\n', 'utf-8');
    console.log(`🧹 Removed Qdrant section from ${label}`);
    return { removed: true, fileDeleted: false };
  } else {
    // File is now empty — delete it
    unlinkSync(filePath);
    console.log(`🧹 Removed Qdrant section from ${label} (file deleted)`);
    return { removed: true, fileDeleted: true };
  }
}

/**
 * Remove auto-retrieve instructions from project-level KNOWLEDGE.md.
 * Only removes the Qdrant section, preserving other content in the file.
 *
 * @param {{ cwd?: string }} [options]
 * @param {{ cwd?: string }} [options.cwd] - Project root directory (defaults to process.cwd())
 * @returns {{ knowledgeRemoved: boolean }}
 */
function removeKnowledgeInstructions(options = {}) {
  const cwd = options.cwd || process.cwd();
  const { knowledgePath } = resolveKnowledgePaths(cwd);

  const knowledgeResult = removeInstructionsFromFile(knowledgePath, 'KNOWLEDGE.md');

  return {
    knowledgeRemoved: knowledgeResult.removed,
  };
}

module.exports = { ensureKnowledgeInstructions, removeKnowledgeInstructions, removeInstructionsFromFile };
module.exports.default = ensureKnowledgeInstructions;
