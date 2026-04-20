#!/usr/bin/env node

/**
 * Auto-Retrieve Instructions Installer
 *
 * Scrive istruzioni per l'agent GSD su come usare il tool auto_retrieve
 * nel file ~/.gsd/agent/KNOWLEDGE.md. Questo file viene iniettato automaticamente
 * nel system prompt di GSD ad ogni sessione (vedi system-context.js).
 *
 * L'installazione è safe-to-run-multiple-times: usa un marker-based dedup
 * per evitare duplicazioni.
 */

const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const SECTION_MARKER = '## Cross-Project Knowledge Retrieval (Qdrant)';
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
 * at startup, not touched by GSD updates. Safe to call multiple times.
 *
 * @returns {{ created: boolean, updated: boolean }} Status of the operation
 */
function ensureAutoRetrieveInstructions() {
  const gsdHome = process.env.GSD_HOME || join(process.env.HOME || '', '.gsd');
  const agentsPath = join(gsdHome, 'agent', 'AGENTS.md');

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

  // Check if instructions already present (marker-based dedup)
  if (existingContent.includes(SECTION_MARKER)) {
    console.log('ℹ️  Auto-retrieve instructions already in AGENTS.md');
    return { created: false, updated: false };
  }

  // Append instructions to existing content or create new file
  const newContent = existingContent + SECTION_CONTENT + '\n';
  writeFileSync(agentsPath, newContent, 'utf-8');
  console.log('📝 Created: ~/.gsd/agent/AGENTS.md (auto-retrieve instructions)');
  return { created: true, updated: false };
}

module.exports = { ensureAutoRetrieveInstructions };
module.exports.default = ensureAutoRetrieveInstructions;
