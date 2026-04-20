#!/usr/bin/env node

/**
 * Auto-Retrieve Instructions Installer
 *
 * Scrive istruzioni per l'agent GSD su come usare il tool auto_retrieve
 * nel file ~/.gsd/agent/AGENTS.md. Questo file viene iniettato automaticamente
 * nel system prompt di GSD ad ogni sessione (vedi system-context.js).
 *
 * L'installazione è safe-to-run-multiple-times: usa un marker-based dedup
 * con version-aware patching per evitare duplicazioni e aggiornare solo
 * la sezione del template quando la versione di package.json cambia.
 * Il resto del file AGENTS.md (altri template, note utente) viene preservato.
 */

const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const SECTION_MARKER = '## Cross-Project Knowledge Retrieval (Qdrant)';
const VERSION_PREFIX = '# GSD-QDRANT-TEMPLATE-VERSION: ';

const SECTION_CONTENT = `
${SECTION_MARKER}

This project has GSD-Qdrant installed. The agent can query cross-project knowledge from the unified Qdrant vector database via MCP.

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

The tool returns relevant context from other GSD projects indexed in Qdrant. Use this context to avoid reinventing solutions and learn from existing patterns.

### Notes
- Results are ranked by semantic relevance + cross-project boost
- Prefer \`includeContent: true\` when you need the actual source content, not just summaries
- The MCP server must be running (configured in .mcp.json as \`gsd-qdrant\`)
`;

/**
 * Ensure auto-retrieve instructions are present in ~/.gsd/agent/AGENTS.md.
 * AGENTS.md is the standard Pi/GSD file for global instructions — loaded automatically
 * at startup, not touched by GSD updates.
 *
 * Uses marker-based dedup with version-aware patching: only replaces the content
 * between markers when the installed version (from package.json) differs from what's
 * recorded in the file. Other content in AGENTS.md is preserved.
 *
 * @param {{ force?: boolean }} [options] - If force is true, always update even if versions match.
 * @returns {{ created: boolean, updated: boolean }} Status of the operation
 */
function ensureAutoRetrieveInstructions(options = {}) {
  const gsdHome = process.env.GSD_HOME || join(process.env.HOME || '', '.gsd');
  const agentsPath = join(gsdHome, 'agent', 'AGENTS.md');

  // Read current package version from package.json (source of truth)
  let packageVersion;
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    packageVersion = pkg.version;
  } catch (_) {
    packageVersion = null;
  }

  // Ensure ~/.gsd/agent/ directory exists
  const agentDir = join(gsdHome, 'agent');
  if (!existsSync(agentDir)) {
    mkdirSync(agentDir, { recursive: true });
    console.log('📂 Created: ~/.gsd/agent/');
  }

  let existingContent = '';
  if (existsSync(agentsPath)) {
    existingContent = readFileSync(agentsPath, 'utf-8');
  }

  const hasMarker = existingContent.includes(SECTION_MARKER);
  const installedVersion = extractVersion(existingContent);
  const needsUpdate = !hasMarker || installedVersion !== packageVersion || options.force;

  if (!needsUpdate) {
    console.log('ℹ️  Auto-retrieve instructions already in AGENTS.md');
    return { created: false, updated: false };
  }

  if (hasMarker && installedVersion !== packageVersion) {
    // Strip ALL version marker lines first, then replace the section.
    // This avoids stale markers from old versions.
    const cleaned = existingContent.replace(
      /# GSD-QDRANT-TEMPLATE-VERSION: \d+\.\d+\.\d+\n?/g,
      ''
    );
    const newContent = replaceBetweenMarkers(
      cleaned,
      SECTION_MARKER,
      VERSION_PREFIX + packageVersion + '\n' + SECTION_CONTENT + '\n'
    );
    writeFileSync(agentsPath, newContent, 'utf-8');
    console.log(`📝 Updated: ~/.gsd/agent/AGENTS.md (Qdrant section v${installedVersion} → v${packageVersion})`);
    return { created: false, updated: true };
  }

  // Append instructions to existing content or create new file
  const newContent = existingContent + VERSION_PREFIX + packageVersion + '\n' + SECTION_CONTENT + '\n';
  writeFileSync(agentsPath, newContent, 'utf-8');
  console.log('📝 Created: ~/.gsd/agent/AGENTS.md (auto-retrieve instructions)');
  return { created: true, updated: false };
}

/**
 * Extract the template version from AGENTS.md content.
 * Returns null if no version marker is found.
 */
function extractVersion(content) {
  const match = content.match(/# GSD-QDRANT-TEMPLATE-VERSION:\s*(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

/**
 * Replace the content starting from startMarker up to (but not including) the next ## section heading.
 * Preserves all other content in the file.
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
  // A section heading is a line starting with ## at the beginning
  const afterStart = content.substring(startIndex + startMarker.length);
  const nextHeadingMatch = afterStart.match(/\n##\s+\S/);

  let endIndex;
  if (nextHeadingMatch) {
    // Replace everything from startMarker up to (but not including) the next ## heading
    endIndex = startIndex + startMarker.length + nextHeadingMatch.index;
  } else {
    // No more sections — replace everything from startMarker to end of file
    endIndex = content.length;
  }

  return content.substring(0, startIndex) + replacement + content.substring(endIndex);
}

module.exports = { ensureAutoRetrieveInstructions };
module.exports.default = ensureAutoRetrieveInstructions;
