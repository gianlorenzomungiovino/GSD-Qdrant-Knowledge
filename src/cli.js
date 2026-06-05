#!/usr/bin/env node

/**
 * GSD + Qdrant CLI - Main entry point (v2.3.2+)
 *
 * Architecture:
 * - Installed globally or locally via npm (bin entries)
 * - Project setup creates ONLY config files (.mcp.json, hooks, .gsd/KNOWLEDGE.md)
 * - NO JavaScript files are copied into the project
 */

const { spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, unlinkSync } = fs;
const { join, dirname, basename, relative, resolve } = require('path');
const os = require('os');
const { applyRecencyBoost, applySymbolBoost, extractKeywords, estimateTokens, trimResultsByTokenBudget, sortChunksByPosition, formatResultsForOutput } = require('./re-ranking');

const PROJECT_ROOT = process.cwd();
const ROOT_PKG = join(PROJECT_ROOT, 'package.json');
const API_PKG = join(PROJECT_ROOT, 'apps', 'api', 'package.json');
const DEFAULT_QDRANT_URL = 'http://localhost:6333';
const QDRANT_HEALTHZ_PATH = '/healthz';
const OLD_TOOL_DIR_NAME = 'gsd-qdrant-knowledge';

// ─── Argument parsing ────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, args };
}

// ─── MCP Server path resolution (for .mcp.json generation) ───────────

/**
 * Resolve the command to use for gsd-qdrant-mcp.
 * Tries: npm bin resolution → global npm root → fallback to bare command name.
 */
function getMcpServerCommand() {
  // 1. Try to resolve via require (works for local/global npm installs)
  try {
    const resolved = require.resolve('gsd-qdrant-knowledge');
    const mcpPath = join(dirname(resolved), 'src', 'gsd-qdrant-mcp', 'index.js');
    if (existsSync(mcpPath)) {
      return { command: 'node', args: [mcpPath] };
    }
  } catch (_) {}

  // 2. Try __dirname relative paths (works when CLI is run directly from source)
  const cliRoot = __dirname;
  const relativePaths = [
    join(cliRoot, 'gsd-qdrant-mcp', 'index.js'),
    join(dirname(cliRoot), 'src', 'gsd-qdrant-mcp', 'index.js'),
    join(cliRoot, '..', 'src', 'gsd-qdrant-mcp', 'index.js'),
  ];
  for (const p of relativePaths) {
    if (existsSync(p)) {
      return { command: 'node', args: [p] };
    }
  }

  // 3. Try global npm root
  try {
    const result = spawnSync('npm', ['root', '-g'], { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    if (result.status === 0) {
      const globalModules = result.stdout.toString().trim();
      const mcpPath = join(globalModules, 'gsd-qdrant-knowledge', 'src', 'gsd-qdrant-mcp', 'index.js');
      if (existsSync(mcpPath)) {
        return { command: 'node', args: [mcpPath] };
      }
    }
  } catch (_) {}

  // 4. Last resort: try to find package.json to derive path
  const pkgPath = findFileInCliRoot('package.json');
  if (pkgPath) {
    const mcpPath = join(dirname(pkgPath), 'src', 'gsd-qdrant-mcp', 'index.js');
    if (existsSync(mcpPath)) {
      return { command: 'node', args: [mcpPath] };
    }
  }

  // 5. Absolute fallback: assume installed in standard npm location
  const nodePrefix = process.env.APPDATA ? join(process.env.APPDATA, 'npm') : '/usr/local';
  const fallbackPaths = [
    join(nodePrefix, 'node_modules', 'gsd-qdrant-knowledge', 'src', 'gsd-qdrant-mcp', 'index.js'),
    join(nodePrefix, '..', 'lib', 'node_modules', 'gsd-qdrant-knowledge', 'src', 'gsd-qdrant-mcp', 'index.js'),
  ];
  for (const p of fallbackPaths) {
    if (existsSync(p)) {
      return { command: 'node', args: [p] };
    }
  }

  // Should never reach here if package is installed correctly
  console.error('❌ Cannot find gsd-qdrant-mcp server. Is gsd-qdrant-knowledge installed?');
  process.exit(1);
}

// ─── Helper utilities ────────────────────────────────────────────────

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
    ...options,
  });
}

function findFileInCliRoot(filename) {
  const cliRoot = __dirname;
  const candidates = [
    join(cliRoot, filename),
    join(dirname(cliRoot), filename),       // package root (global/local npm install)
    join(dirname(cliRoot), 'src', filename), // src/ relative to package root
    join(process.cwd(), filename),           // fallback: cwd
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function readJsonFile(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJsonFile(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function findPackagePath() {
  if (existsSync(API_PKG)) return API_PKG;
  if (existsSync(ROOT_PKG)) return ROOT_PKG;
  return null;
}

// ─── QDrant health check ─────────────────────────────────────────────

async function checkQdrantHealth(url) {
  return new Promise((resolve) => {
    const req = http.get(`${url}${QDRANT_HEALTHZ_PATH}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const ok = body.includes('ok') || body.includes('passed');
        resolve(ok);
      });
    });
    req.on('error', () => { resolve(false); });
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

async function ensureQdrantRunning() {
  const qdrantUrl = process.env.QDRANT_URL || DEFAULT_QDRANT_URL;
  const healthy = await checkQdrantHealth(qdrantUrl);
  if (healthy) {
    console.log('✅ QDrant server detected at ' + qdrantUrl);
    return { url: qdrantUrl };
  }

  console.error('❌ QDrant is not running at ' + qdrantUrl);
  console.error('   Start it with: docker run -d --name qdrant -p 6333:6333 qdrant/qdrant');
  console.error('   Or set QDRANT_URL environment variable to your QDrant instance.');
  process.exit(1);
}

// ─── Setup command (v2.3.3) ──────────────────────────────────────────

/**
 * Setup the project for GSD + Qdrant integration.
 * Creates minimal config files only — no JS copying.
 * Uses async/await identical to runSync() for consistent behavior.
 */
async function setupProject() {
  console.log('🚀 GSD + Qdrant — Project Setup\n');

  const mcpCommand = getMcpServerCommand();
  const qdrantUrl = process.env.QDRANT_URL || DEFAULT_QDRANT_URL;
  const collectionName = process.env.COLLECTION_NAME || 'gsd_memory';
  const vectorName = process.env.VECTOR_NAME || 'bge-m3-1024';

  // 1. Check for old installation artifacts
  const oldToolDir = join(PROJECT_ROOT, OLD_TOOL_DIR_NAME);
  if (existsSync(oldToolDir)) {
    console.warn(`⚠️  Found old ${OLD_TOOL_DIR_NAME}/ directory.`);
    console.warn('   This is no longer used. Run `gsd-qdrant-knowledge migrate` to clean it up.');
    console.warn('   Continuing with new setup...\n');
  }

  // 2. Create .mcp.json
  const mcpJsonPath = join(PROJECT_ROOT, '.mcp.json');
  const existingMcp = readJsonFile(mcpJsonPath, { mcpServers: {} });
  const mcpServers = existingMcp.mcpServers && typeof existingMcp.mcpServers === 'object'
    ? existingMcp.mcpServers
    : {};

  const desiredServerConfig = {
    command: mcpCommand.command,
    args: [...(mcpCommand.args || []), '--project', PROJECT_ROOT],
    env: {
      QDRANT_URL: qdrantUrl,
      COLLECTION_NAME: collectionName,
      VECTOR_NAME: vectorName,
    },
  };

  const previousConfig = mcpServers['gsd-qdrant'] || null;
  const previousStr = previousConfig ? JSON.stringify(previousConfig) : null;
  const nextStr = JSON.stringify(desiredServerConfig);

  if (previousStr !== nextStr) {
    mcpServers['gsd-qdrant'] = desiredServerConfig;
    existingMcp.mcpServers = mcpServers;
    writeJsonFile(mcpJsonPath, existingMcp);
    console.log('📝 Created/Updated: .mcp.json');
  } else {
    console.log('ℹ️  .mcp.json already configured');
  }

  // 3. Install post-commit hook
  installPostCommitHook();

  // 4. Create .gsd/KNOWLEDGE.md if not exists
  const knowledgePath = join(PROJECT_ROOT, '.gsd', 'KNOWLEDGE.md');
  if (!existsSync(knowledgePath)) {
    mkdirSync(dirname(knowledgePath), { recursive: true });
    const pkgPath = findFileInCliRoot('package.json');
    const pkg = pkgPath ? JSON.parse(readFileSync(pkgPath, 'utf8')) : { version: '2.3.2' };

    const knowledgeContent = `# Project Knowledge

Append-only register of project-specific rules, patterns, and lessons learned.
Agents read this before every unit. Add entries when you discover something worth remembering.
## Cross-Project Knowledge Retrieval (Qdrant)

GSD-Qdrant is installed. Use \`auto_retrieve\` (via \`gsd-qdrant\` MCP server) to query cross-project knowledge.

### When to use

**Use \`auto_retrieve\` for:**
- Library/framework/component questions, API usage, design patterns
- When local search returns nothing or the topic might exist in other GSD projects

### How to call

\`\`\`
auto_retrieve(task: "your task description", limit: 3, includeContent: false)
\`\`\`

Set \`includeContent: true\` when you need full source text, not just summaries.

### Query tips

Before calling, distill your question into **2-4 keywords** (concrete nouns/verbs, no filler).

1. **Keep exact identifiers** — function/class/library names, file paths as-is
2. **Strip conversational framing** — remove questions, polite words, fillers
3. **Include all topics** — list distinct concepts, drop connecting words
4. **Any language works** — bge-m3 is multilingual; keep terms in their original language

### Notes

- Results ranked by semantic relevance + cross-project boost
- MCP server configured in \`.mcp.json\` as \`gsd-qdrant\`
`;
    writeFileSync(knowledgePath, knowledgeContent, 'utf8');
    console.log('📝 Created: .gsd/KNOWLEDGE.md');
  } else {
    // Ensure the Qdrant section is present (version-aware update)
    const instructionsScript = findFileInCliRoot('knowledge-instructions.js');
    if (existsSync(instructionsScript)) {
      try {
        const { ensureKnowledgeInstructions } = require(instructionsScript);
        ensureKnowledgeInstructions({ cwd: PROJECT_ROOT });
      } catch (err) {
        console.warn('⚠️  Knowledge instructions update failed:', err.message);
      }
    }
  }

  // 5. Check dependencies
  const pkgPath = findPackagePath();
  if (!pkgPath) {
    console.error('❌ No package.json found. Are you in a Node.js project?');
    process.exit(1);
  }

  console.log(`📁 Project: ${basename(PROJECT_ROOT)}`);

  // 6. Ensure QDrant is running before initial sync (AWAITED — no race condition)
  await ensureQdrantRunning();

  // 7. Run initial sync — identical flow to runSync()
  console.log('\n🔄 Running initial sync...');
  try {
    const templatePath = findFileInCliRoot('gsd-qdrant-template.js');
    if (!templatePath) {
      console.error('❌ Cannot find gsd-qdrant-template.js. Package may be corrupted.');
      process.exit(1);
    }
    const { GSDKnowledgeSync } = require(templatePath);
    const sync = new GSDKnowledgeSync();
    // Override project root if --project was passed
    if (process.argv.includes('--project')) {
      const projIdx = process.argv.indexOf('--project');
      sync.projectName = basename(process.argv[projIdx + 1]);
    }
    await sync.init();
    const summary = await sync.syncToGsdMemory();
    console.log(`✅ Initial sync complete! Indexed: ${summary.total}`);
    console.log('\n✅ Setup complete. Use `gsd-qdrant-knowledge context <query>` to search.');
  } catch (syncErr) {
    console.error('\n❌ Initial sync failed.');
    console.error('   Error:', syncErr.message);
    console.error('   Make sure QDrant is running and the collection exists.');
    process.exit(1);
  }
}

// ─── Migrate command (cleanup old installation) ──────────────────────

function migrateProject() {
  console.log('🔄 GSD + Qdrant — Migration\n');

  const oldToolDir = join(PROJECT_ROOT, OLD_TOOL_DIR_NAME);
  if (!existsSync(oldToolDir)) {
    console.log('ℹ️  No old installation found. Nothing to migrate.');
    return;
  }

  console.log(`🧹 Removing old ${OLD_TOOL_DIR_NAME}/ directory...`);
  rmSync(oldToolDir, { recursive: true, force: true });
  console.log(`✅ Removed: ${OLD_TOOL_DIR_NAME}/`);

  // Clean up .gitignore entry
  removeFromGitignore(PROJECT_ROOT, `${OLD_TOOL_DIR_NAME}/`);

  // Clean up old MCP config if it exists in the old directory
  const oldMcpPath = join(oldToolDir, 'mcp.json'); // already deleted, but just in case
  // Clean up old root .mcp.json registration (will be recreated by setup)
  removeRootMcpRegistration();

  console.log('\n✅ Migration complete. Run `gsd-qdrant-knowledge setup` to configure the new architecture.');
}

// ─── Uninstall command ───────────────────────────────────────────────

async function uninstallProjectArtifacts() {
  // Step 1: Clean up Qdrant collection
  const qdrantUrl = process.env.QDRANT_URL || DEFAULT_QDRANT_URL;
  try {
    const templatePath = findFileInCliRoot('gsd-qdrant-template.js');
    if (templatePath) {
      const { GSDKnowledgeSync } = require(templatePath);
      const sync = new GSDKnowledgeSync();
      sync.client = new (require('@qdrant/js-client-rest').QdrantClient)({ url: qdrantUrl });
      const deleted = await sync.deleteAllProjectPoints();
      if (deleted > 0) {
        console.log(`🧹 Qdrant: Deleted ${deleted} point(s) for project '${sync.projectName}'`);
      } else {
        console.log(`ℹ️  Qdrant: No points found for project '${sync.projectName}'`);
      }
    }
  } catch (err) {
    console.warn('⚠️  Qdrant cleanup skipped:', err.message);
  }

  // Step 2: Remove local artifacts
  removeRootMcpRegistration();

  const hooksDir = join(PROJECT_ROOT, '.git', 'hooks');
  if (existsSync(hooksDir)) {
    for (const hook of ['post-commit.sh', 'post-commit.bat', 'post-commit.ps1']) {
      const hookPath = join(hooksDir, hook);
      if (existsSync(hookPath)) {
        try {
          const content = readFileSync(hookPath, 'utf8');
          if (content.includes('gsd-qdrant-knowledge')) {
            unlinkSync(hookPath);
            console.log(`🧹 Removed: .git/hooks/${hook}`);
          }
        } catch (_) {}
      }
    }
  }

  // Remove old directory if it still exists
  if (existsSync(join(PROJECT_ROOT, OLD_TOOL_DIR_NAME))) {
    rmSync(join(PROJECT_ROOT, OLD_TOOL_DIR_NAME), { recursive: true, force: true });
    console.log(`🧹 Removed: ${OLD_TOOL_DIR_NAME}/`);
  }

  // Remove auto-retrieve instructions
  const instructionsScript = findFileInCliRoot('knowledge-instructions.js');
  if (existsSync(instructionsScript)) {
    try {
      const { removeKnowledgeInstructions } = require(instructionsScript);
      removeKnowledgeInstructions({ cwd: PROJECT_ROOT });
    } catch (err) {
      console.warn('⚠️  Knowledge instructions cleanup failed:', err.message);
    }
  }

  // Note about the embedding model cache
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  const modelCachePath = join(home, '.cache', 'huggingface', 'hub', 'Xenova', 'bge-m3');
  console.log(`\n💡 Embedding model cache: ${modelCachePath}`);
  console.log('   This model was pre-installed by gsd-qdrant-knowledge.');
  console.log('   If you no longer need it, you can safely delete this directory.');
  console.log('   Other models in this cache are shared and will NOT be removed.');
}

// ─── Gitignore helpers ───────────────────────────────────────────────

async function addToGitignore(projectRoot, entry) {
  const gitignorePath = join(projectRoot, '.gitignore');
  if (!existsSync(gitignorePath)) return;
  const content = await fs.promises.readFile(gitignorePath, 'utf8');
  const lines = content.split('\n');
  if (lines.some(line => line.trim() === entry)) return;
  await fs.promises.writeFile(gitignorePath, content + '\n' + entry + '\n', 'utf8');
  console.log(`📝 Added '${entry}' to .gitignore`);
}

async function removeFromGitignore(projectRoot, entry) {
  const gitignorePath = join(projectRoot, '.gitignore');
  if (!existsSync(gitignorePath)) return;
  const content = await fs.promises.readFile(gitignorePath, 'utf8');
  const next = content
    .split('\n')
    .filter(line => line.trim() !== entry)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  if (next !== content) {
    await fs.promises.writeFile(gitignorePath, next, 'utf8');
    console.log(`🧹 Removed '${entry}' from .gitignore`);
  }
}

// ─── MCP registration helpers ────────────────────────────────────────

function removeRootMcpRegistration() {
  const rootMcpPath = join(PROJECT_ROOT, '.mcp.json');
  if (!existsSync(rootMcpPath)) return;
  const current = readJsonFile(rootMcpPath, null);
  if (!current || !current.mcpServers || !current.mcpServers['gsd-qdrant']) return;
  delete current.mcpServers['gsd-qdrant'];
  if (Object.keys(current.mcpServers).length === 0) {
    unlinkSync(rootMcpPath);
    console.log('🧹 Removed: .mcp.json');
    return;
  }
  writeJsonFile(rootMcpPath, current);
  console.log('🧹 Updated: .mcp.json');
}

// ─── Post-commit hook installer ──────────────────────────────────────

function installPostCommitHook() {
  const hooksDir = join(PROJECT_ROOT, '.git', 'hooks');
  if (!existsSync(hooksDir)) return;

  const isWindows = process.platform === 'win32';
  const hookName = isWindows ? 'post-commit.bat' : 'post-commit.sh';
  const hookPath = join(hooksDir, hookName);

  const templates = [
    join(__dirname, 'hooks', hookName),
    join(dirname(__dirname), 'src', 'hooks', hookName),
  ];

  let hookContent = null;
  for (const t of templates) {
    if (existsSync(t)) {
      hookContent = readFileSync(t, 'utf8');
      break;
    }
  }

  if (!hookContent) return;

  try {
    const existing = readFileSync(hookPath, 'utf8');
    if (existing === hookContent) return;
  } catch (_) {}

  writeFileSync(hookPath, hookContent, { mode: isWindows ? undefined : 0o755 });
  console.log(`📝 Post-commit hook installed (${hookName})`);
}

// ─── Sync command ────────────────────────────────────────────────────

async function runSync() {
  try {
    const templatePath = findFileInCliRoot('gsd-qdrant-template.js');
    if (!templatePath) {
      console.error('❌ Cannot find gsd-qdrant-template.js.');
      process.exit(1);
    }
    const { GSDKnowledgeSync } = require(templatePath);
    const sync = new GSDKnowledgeSync();
    await sync.init();
    const summary = await sync.syncToGsdMemory();
    console.log(`✅ Sync complete: ${summary.total} indexed, ${summary.deleted || 0} orphans deleted`);
  } catch (err) {
    console.error('❌ Sync failed:', err.message);
    process.exit(1);
  }
}

// ─── Context command ─────────────────────────────────────────────────

async function runContext(query) {
  const templatePath = findFileInCliRoot('gsd-qdrant-template.js');
  if (!templatePath) {
    console.error('❌ Cannot find gsd-qdrant-template.js.');
    process.exit(1);
  }

  const { GSDKnowledgeSync } = require(templatePath);
  const intentDetector = require(findFileInCliRoot('intent-detector.js') || 'src/intent-detector.js');
  const project_id = basename(PROJECT_ROOT);

  if (!query) {
    console.log('❌ Please provide a query for context building.');
    console.log('Usage: gsd-qdrant-knowledge context <query>');
    process.exit(1);
  }

  const intent = intentDetector.detectIntent(query);
  const qdrantFilter = intentDetector.buildQdrantFilter(intent);

  const sync = new GSDKnowledgeSync();
  await sync.init();

  const embeddedQuery = intentDetector.extractKeywords(query) || query;
  const vector = await sync.embedText(embeddedQuery);

  const SCORE_THRESHOLD = 0.78;
  const FALLBACK_THRESHOLD = 0.55;
  const LIMIT = 5;
  const GROUP_SIZE = 2;

  let hits = [];
  let groupCount = 0;
  try {
    const groupConfig = {
      vector: { name: sync.vectorName, vector },
      group_by: 'source',
      group_size: GROUP_SIZE,
      limit: LIMIT * 3,
      with_payload: true,
      with_vector: false,
    };
    if (qdrantFilter) groupConfig.filter = qdrantFilter;

    const groupedResults = await sync.client.searchPointGroups(sync.collectionName, groupConfig);
    groupCount = groupedResults.groups.length;
    for (const group of groupedResults.groups) {
      hits = hits.concat(group.hits);
    }
  } catch (groupErr) {
    console.warn('[qdrant] searchPointGroups not supported, falling back to search');
    try {
      const searchConfig = {
        vector: { name: sync.vectorName, vector },
        limit: LIMIT * 10,
        with_payload: true,
        with_vector: false,
      };
      if (qdrantFilter) searchConfig.filter = qdrantFilter;
      const rawHits = await sync.client.search(sync.collectionName, searchConfig);
      const sourceCounts = {};
      for (const hit of rawHits) {
        const src = hit.payload && hit.payload.source;
        if (!src || (sourceCounts[src] || 0) >= GROUP_SIZE) continue;
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;
        hits.push(hit);
      }
      groupCount = Object.keys(sourceCounts).length;
    } catch (searchErr) {
      console.warn('[qdrant] search also failed:', searchErr.message);
    }
  }

  const totalResults = hits.length;
  console.log('[qdrant] results: %d total, %d above threshold', totalResults, hits.filter(h => h.score >= SCORE_THRESHOLD).length);

  let rankedHits = hits.filter(hit => hit.score >= SCORE_THRESHOLD);
  if (rankedHits.length < 2 && totalResults > 0) {
    console.log(`[qdrant] fallback: only ${rankedHits.length} results above ${SCORE_THRESHOLD.toFixed(2)}, retrying with ${FALLBACK_THRESHOLD.toFixed(2)}`);
    rankedHits = hits.filter(hit => hit.score >= FALLBACK_THRESHOLD);
  }

  rankedHits = sortChunksByPosition(rankedHits);

  let rankedResults = rankedHits.map(hit => ({ ...hit.payload, score: hit.score, _query: query }));
  applyRecencyBoost(rankedResults, 30, query);
  applySymbolBoost(rankedResults, query);

  const ranked = rankedResults
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT);

  const { results: formattedResults, trimmedInfo, totalTokens } = formatResultsForOutput(ranked, { maxTokens: 4000 });

  const elapsed = Date.now() - Date.now(); // placeholder — actual timing not critical here
  console.log(`[qdrant] group_by: groups=${groupCount}, chunks=${totalResults} (threshold=${SCORE_THRESHOLD.toFixed(2)} → ${rankedHits.length} above)`);
  if (trimmedInfo && trimmedInfo.trimmed) {
    console.log(`[retrieval] %d results, ~%d estimated tokens, trimmed to 500 chars per result`, formattedResults.length, totalTokens);
  }

  console.log(JSON.stringify({ query, project_id, results: formattedResults }, null, 2));
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2);
  const { positional, args } = parseArgs(rawArgs);
  const command = positional[0];

  if (args['version'] || args['v'] || command === '--version' || command === '-v') {
    const pkgPath = findFileInCliRoot('package.json');
    if (!pkgPath) {
      console.error('❌ Cannot find package.json. Is this package installed correctly?');
      process.exit(1);
    }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    console.log(`gsd-qdrant-knowledge v${pkg.version}`);
    process.exit(0);
  }

  if (command === 'setup') {
    setupProject();
    return;
  }

  if (command === 'migrate') {
    migrateProject();
    return;
  }

  if (command === 'uninstall') {
    await uninstallProjectArtifacts();
    await removeFromGitignore(PROJECT_ROOT, `${OLD_TOOL_DIR_NAME}/`);
    console.log('\n✅ Uninstall complete');
    return;
  }

  if (command === 'sync') {
    await runSync();
    return;
  }

  if (command === 'context') {
    await runContext(positional[1] || '');
    return;
  }

  // Default: run setup (backward compatible)
  setupProject();
}

main();
