#!/usr/bin/env node

/**
 * GSD + Qdrant CLI - Main entry point
 */

const { spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const { existsSync, readFileSync, mkdirSync, writeFileSync, copyFileSync, rmSync, unlinkSync } = fs;
const { join, dirname, extname, basename } = require('path');
const readline = require('readline');

const PROJECT_ROOT = process.cwd();
const ROOT_PKG = join(PROJECT_ROOT, 'package.json');
const API_PKG = join(PROJECT_ROOT, 'apps', 'api', 'package.json');
const CLI_ROOT = __dirname;
const TOOL_DIR_NAME = 'gsd-qdrant-knowledge';
const TOOL_DIR = join(PROJECT_ROOT, TOOL_DIR_NAME);
const TOOL_MCP_FILE = join(TOOL_DIR, 'mcp.json');
const ROOT_MCP_FILE = join(PROJECT_ROOT, '.mcp.json');
const TOOL_MARKER = 'managedBy';
const TOOL_MARKER_VALUE = 'gsd-qdrant-knowledge';
const MCP_SERVER_NAME = 'gsd-qdrant';

const DEFAULT_QDRANT_URL = 'http://localhost:6333';
const QDRANT_HEALTHZ_PATH = '/healthz';

/**
 * Resolve the actual path to gsd-qdrant-mcp/index.js.
 * Tries: local node_modules → global npm root → relative (dev symlink).
 * Returns null if nothing is found.
 */
function getMcpServerPath() {
  // 1. Local resolution
  try {
    const resolved = require.resolve('gsd-qdrant-knowledge');
    const mcpPath = join(dirname(resolved), 'src', 'gsd-qdrant-mcp', 'index.js');
    if (existsSync(mcpPath)) return mcpPath;
  } catch (_) {}

  // 2. Global npm root resolution
  try {
    const globalModules = getGlobalNodeModulesPath();
    if (globalModules) {
      const mcpPath = join(globalModules, 'gsd-qdrant-knowledge', 'src', 'gsd-qdrant-mcp', 'index.js');
      if (existsSync(mcpPath)) return mcpPath;
    }
  } catch (_) {}

  // 3. Relative path from CLI root (development / symlink)
  const cliRoot = __dirname;
  const candidates = [
    join(cliRoot, 'gsd-qdrant-mcp', 'index.js'),
    join(dirname(cliRoot), 'src', 'gsd-qdrant-mcp', 'index.js'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  return null;
}

function findFileInCliRoot(filename) {
  const pathInCliRoot = join(CLI_ROOT, filename);
  if (existsSync(pathInCliRoot)) return pathInCliRoot;
  return join(dirname(CLI_ROOT), filename);
}

function getExtensionForLanguage(language) {
  if (!language) return '.js';
  const lang = language.toLowerCase();
  const extensions = {
    javascript: '.js', js: '.js', typescript: '.ts', ts: '.ts', python: '.py', py: '.py',
    go: '.go', rust: '.rs', java: '.java', c: '.c', cpp: '.cpp', 'c++': '.cpp', 'c#': '.cs',
    ruby: '.rb', php: '.php', swift: '.swift', kt: '.kt', kotlin: '.kt', scala: '.scala',
    html: '.html', css: '.css', scss: '.scss', less: '.less', json: '.json', yaml: '.yaml',
    yml: '.yml', markdown: '.md', md: '.md', sql: '.sql', sh: '.sh', bash: '.sh', zsh: '.zsh',
    powershell: '.ps1', r: '.r', rscript: '.r'
  };
  return extensions[lang] || '.js';
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
    ...options,
  });
}

const REQUIRED_PACKAGES = [
  '@qdrant/js-client-rest',
  '@xenova/transformers',
  '@modelcontextprotocol/sdk',
  'zod'
];

function findPackagePath() {
  if (existsSync(API_PKG)) return API_PKG;
  if (existsSync(ROOT_PKG)) return ROOT_PKG;
  return null;
}

function getGlobalNodeModulesPath() {
  try {
    const result = spawnSync('npm', ['root', '-g'], { shell: true });
    if (result.status === 0) return result.stdout.toString().trim();
  } catch (_) {}
  return null;
}

function areRequiredPackagesInstalled(projectRoot, pkgPath) {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const declaredDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    for (const dep of REQUIRED_PACKAGES) {
      if (!declaredDeps[dep]) continue;
      try {
        require.resolve(dep, { paths: [projectRoot] });
        continue;
      } catch (_) {
        const globalPath = getGlobalNodeModulesPath();
        if (globalPath) {
          try {
            require.resolve(dep, { paths: [globalPath] });
            continue;
          } catch (_) {}
        }
        return false;
      }
    }

    return true;
  } catch (_) {
    return false;
  }
}

function installDependencies(pkgPath) {
  if (areRequiredPackagesInstalled(PROJECT_ROOT, pkgPath)) {
    console.log('📦 Dependencies: ok');
    return 'ok';
  }

  console.log('📦 Dependencies: installing missing packages...');
  const result = run('npm', ['install', ...REQUIRED_PACKAGES], { cwd: PROJECT_ROOT });
  if (result.status !== 0) {
    console.error('❌ Dependency installation failed.');
    process.exit(result.status || 1);
  }
  return 'installed';
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

// ─── QDrant health check ──────────────────────────────────────────────

/**
 * Check if a QDrant server is healthy at the given URL.
 * Qdrant v1.x returns plain text "healthz check passed" on /healthz.
 * Returns true if the response indicates health.
 * @param {string} url - Base URL (e.g. http://localhost:6333)
 * @returns {Promise<boolean>}
 */
async function checkQdrantHealth(url) {
  return new Promise((resolve) => {
    const req = http.get(`${url}${QDRANT_HEALTHZ_PATH}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        // Qdrant v1.x returns plain text "healthz check passed"
        const ok = body.includes('ok') || body.includes('passed');
        resolve(ok);
      });
    });
    req.on('error', () => { resolve(false); });
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

/**
 * Check if QDrant is running. Exits with error if not available.
 * @returns {{ url: string }}
 */
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

function createGsdQdrantDirectory(projectRoot) {
  const stateFile = join(TOOL_DIR, '.qdrant-sync-state.json');
  const packageFile = join(TOOL_DIR, 'package.json');
  const indexFile = join(TOOL_DIR, 'index.js');

  if (!existsSync(TOOL_DIR)) {
    mkdirSync(TOOL_DIR, { recursive: true });
    console.log(`📂 Created directory: ${TOOL_DIR_NAME}/`);
  }

  if (!existsSync(stateFile)) {
    writeJsonFile(stateFile, { lastSync: null, indexed: {} });
    console.log(`📝 Created: ${TOOL_DIR_NAME}/.qdrant-sync-state.json`);
  }

  if (!existsSync(packageFile)) {
    writeFileSync(packageFile, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n', 'utf8');
    console.log(`📝 Created: ${TOOL_DIR_NAME}/package.json`);
  }

  if (!existsSync(indexFile)) {
    const templateIndexFile = findFileInCliRoot('gsd-qdrant-template.js');
    copyFileSync(templateIndexFile, indexFile);
    console.log(`📝 Created: ${TOOL_DIR_NAME}/index.js`);
  }
}

function ensureToolMcpConfig() {
  const mcpPath = getMcpServerPath();
  if (!mcpPath) {
    console.warn('⚠️  Cannot resolve gsd-qdrant-mcp path. Please reinstall the package.');
    return;
  }

  const config = {
    [TOOL_MARKER]: TOOL_MARKER_VALUE,
    serverName: MCP_SERVER_NAME,
    mcpServers: {
      [MCP_SERVER_NAME]: {
        command: 'node',
        args: [mcpPath],
        cwd: '.',
        env: {
          QDRANT_URL: process.env.QDRANT_URL || 'http://localhost:6333',
          COLLECTION_NAME: process.env.COLLECTION_NAME || 'gsd_memory',
          VECTOR_NAME: process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2'
        }
      }
    }
  };
  const existed = existsSync(TOOL_MCP_FILE);
  writeJsonFile(TOOL_MCP_FILE, config);
  console.log(`${existed ? '📝 Updated' : '📝 Created'}: ${TOOL_DIR_NAME}/mcp.json`);
}

function ensureRootMcpRegistration() {
  const mcpPath = getMcpServerPath();
  if (!mcpPath) {
    console.warn('⚠️  Cannot resolve gsd-qdrant-mcp path. Please reinstall the package.');
    return;
  }

  const current = readJsonFile(ROOT_MCP_FILE, { mcpServers: {} });
  const mcpServers = current.mcpServers && typeof current.mcpServers === 'object' ? current.mcpServers : {};
  const desired = {
    command: 'node',
    args: [mcpPath],
    cwd: '.',
    env: {
      QDRANT_URL: process.env.QDRANT_URL || 'http://localhost:6333',
      COLLECTION_NAME: process.env.COLLECTION_NAME || 'gsd_memory',
      VECTOR_NAME: process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2'
    }
  };

  const previous = JSON.stringify(mcpServers[MCP_SERVER_NAME] || null);
  const next = JSON.stringify(desired);
  if (previous === next) {
    console.log('ℹ️  MCP server already registered in .mcp.json');
    return;
  }

  mcpServers[MCP_SERVER_NAME] = desired;
  current.mcpServers = mcpServers;
  writeJsonFile(ROOT_MCP_FILE, current);
  console.log('📝 Updated: .mcp.json');
}

function removeRootMcpRegistration() {
  if (!existsSync(ROOT_MCP_FILE)) return;
  const current = readJsonFile(ROOT_MCP_FILE, null);
  if (!current || !current.mcpServers || !current.mcpServers[MCP_SERVER_NAME]) return;
  delete current.mcpServers[MCP_SERVER_NAME];
  if (Object.keys(current.mcpServers).length === 0) {
    unlinkSync(ROOT_MCP_FILE);
    console.log('🧹 Removed: .mcp.json');
    return;
  }
  writeJsonFile(ROOT_MCP_FILE, current);
  console.log('🧹 Updated: .mcp.json');
}

async function addToGitignore(projectRoot, entry) {
  const gitignorePath = join(projectRoot, '.gitignore');
  if (!existsSync(gitignorePath)) {
    console.log('ℹ️  .gitignore not found, skipping');
    return;
  }
  const content = await fs.promises.readFile(gitignorePath, 'utf8');
  const lines = content.split('\n');
  if (lines.some(line => line.trim() === entry)) {
    console.log('ℹ️  Entry already in .gitignore');
    return;
  }
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

async function uninstallProjectArtifacts() {
  // Step 1: Clean up Qdrant collection FIRST — delete all points for this project
  // Uses server-side filter (scroll ignores unknown params) so only matching points are fetched.
  const qdrantUrl = process.env.QDRANT_URL || DEFAULT_QDRANT_URL;
  try {
    const templatePath = findFileInCliRoot('gsd-qdrant-template.js');
    if (templatePath) {
      const { GSDKnowledgeSync } = require(templatePath);
      // Override QDRANT_URL env for this instance
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
    console.warn('⚠️  Qdrant cleanup skipped (collection may not exist or be unreachable):', err.message);
  }

  // Step 2: Remove local artifacts
  removeRootMcpRegistration();

  const hooksDir = join(PROJECT_ROOT, '.git', 'hooks');
  if (existsSync(hooksDir)) {
    for (const hook of ['post-commit.sh', 'post-commit.bat']) {
      const hookPath = join(hooksDir, hook);
      if (existsSync(hookPath)) {
        // Verifica che sia il nostro hook prima di rimuovere
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

  if (existsSync(TOOL_DIR)) {
    rmSync(TOOL_DIR, { recursive: true, force: true });
    console.log(`🧹 Removed: ${TOOL_DIR_NAME}/`);
  }

 // Remove auto-retrieve instructions from project-level KNOWLEDGE.md
  const instructionsScript = findFileInCliRoot('knowledge-instructions.js');
  if (existsSync(instructionsScript)) {
    try {
      const { removeKnowledgeInstructions } = require(instructionsScript);
      removeKnowledgeInstructions({ cwd: PROJECT_ROOT });
    } catch (err) {
      console.warn('⚠️  Knowledge instructions cleanup failed:', err.message);
    }
  }
}

function installPostCommitHook() {
  const hooksDir = join(PROJECT_ROOT, '.git', 'hooks');
  if (!existsSync(hooksDir)) return;

  const isWindows = process.platform === 'win32';
  const hookName = isWindows ? 'post-commit.bat' : 'post-commit.sh';
  const hookPath = join(hooksDir, hookName);

  // Cerca il template in ordine: src/hooks/ → root/hooks/
  const templates = [
    join(CLI_ROOT, 'hooks', hookName),
    join(dirname(CLI_ROOT), 'src', 'hooks', hookName),
    join(PROJECT_ROOT, 'src', 'hooks', hookName),
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

async function bootstrapProject() {
  console.log('🚀 GSD + Qdrant CLI\n');
  createGsdQdrantDirectory(PROJECT_ROOT);

  // Ensure auto-retrieve instructions are in project-level KNOWLEDGE.md (safe to run multiple times)
  const instructionsScript = findFileInCliRoot('knowledge-instructions.js');
  if (existsSync(instructionsScript)) {
    try {
      const { ensureKnowledgeInstructions } = require(instructionsScript);
      ensureKnowledgeInstructions();
    } catch (err) {
      console.warn('⚠️  Knowledge instructions setup failed:', err.message);
    }
  }

  const installExtensionScript = findFileInCliRoot('install-gsd-extension.js');
  if (existsSync(installExtensionScript)) {
    const installResult = spawnSync('node', [installExtensionScript], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: false
    });
    if (installResult.status !== 0) {
      console.error('⚠️  GSD extension installation failed');
    }
  }

  ensureToolMcpConfig();
  ensureRootMcpRegistration();

  const pkgPath = findPackagePath();
  if (!pkgPath) {
    console.error('❌ No package.json found. Are you in a Node.js project?');
    process.exit(1);
  }

  console.log(`📁 Project: ${basename(PROJECT_ROOT)}`);
  installDependencies(pkgPath);
  run('node', [findFileInCliRoot('setup-from-templates.js')], { cwd: PROJECT_ROOT });

  // Install post-commit hook for automatic knowledge sync
  installPostCommitHook();

  await addToGitignore(PROJECT_ROOT, `${TOOL_DIR_NAME}/`);

  // Ensure QDrant is running before sync
  const qdrantResult = await ensureQdrantRunning();

  // Run sync with the correct QDRANT_URL in env
  const syncScript = findFileInCliRoot('sync-knowledge.js');
  const syncResult = spawnSync('node', [syncScript], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });
  if (syncResult.status !== 0) {
    console.error('\n❌ Initial knowledge sync failed. Collections may be empty.');
    process.exit(syncResult.status || 1);
  }

  console.log('\n✅ Ready');
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--version' || args[0] === '-v') {
    const pkgPath = findFileInCliRoot('package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    console.log(`gsd-qdrant-knowledge v${pkg.version}`);
    process.exit(0);
  }

  if (args[0] === 'uninstall') {
    uninstallProjectArtifacts();
    await removeFromGitignore(PROJECT_ROOT, `${TOOL_DIR_NAME}/`);
    console.log('\n✅ Uninstall complete');
    return;
  }

  if (args.length === 0) {
    await bootstrapProject();
    return;
  }

  if (args[0] === 'context') {
    const { GSDKnowledgeSync } = require(findFileInCliRoot('gsd-qdrant-template.js'));
    const intentDetector = require(findFileInCliRoot('intent-detector.js'));
    const query = args[1] || '';
    const project_id = basename(PROJECT_ROOT);

    if (!query) {
      console.log('❌ Please provide a query for context building.');
      console.log('Usage: gsd-qdrant-knowledge context <query>');
      process.exit(1);
    }

    // Detect search intent and build Qdrant filter from certain filters (must)
    // vs uncertain ones (should)
    const intent = intentDetector.detectIntent(query);
    const qdrantFilter = intentDetector.buildQdrantFilter(intent);

    const sync = new GSDKnowledgeSync();
    await sync.init();
    const vector = await sync.embedText(query);

    // Prefetch-based query with group_by: return max 2 chunks per source document.
    // Uses searchPointGroups() to deduplicate across source documents.
    const t0 = Date.now();
    const PREFETCH_LIMIT = 50; // wider prefetch when must-filter applied
    const GROUP_SIZE = 2;        // max chunks per source document
    const LIMIT = 5;             // max results to return
    const SCORE_THRESHOLD = 0.85;  // minimum score for inclusion
    const FALLBACK_THRESHOLD = 0.75; // lowered threshold if too few results

    let hits = [];
    let groupCount = 0;
    try {
      // searchPointGroups requires the vector query directly (no prefetch syntax).
      // We use prefetch inside the query via Qdrant's internal mechanism, but since
      // searchPointGroups does not support prefetch natively, we fall back to the
      // simpler grouped search approach. The must-filter narrows candidates before scoring.
      const groupConfig = {
        vector: { name: sync.vectorName, vector },
        group_by: 'source',
        group_size: GROUP_SIZE,
        limit: LIMIT * 3,  // request more groups so we can filter by threshold after
        score_threshold: SCORE_THRESHOLD,
        with_payload: true,
        with_vector: false,
      };
      if (qdrantFilter) {
        groupConfig.filter = qdrantFilter;
      }
      const groupedResults = await sync.client.searchPointGroups(
        sync.collectionName,
        groupConfig
      );
      groupCount = groupedResults.groups.length;

      // Flatten groups into a single hits array (preserving score order within each group)
      for (const group of groupedResults.groups) {
        hits = hits.concat(group.hits);
      }
    } catch (groupErr) {
      // Fallback: plain search with grouping done client-side if searchPointGroups fails
      console.warn('[qdrant] searchPointGroups not supported, falling back to search');
      try {
        const searchConfig = {
          vector: { name: sync.vectorName, vector },
          limit: LIMIT * 10, // wider search for client-side dedup
          score_threshold: SCORE_THRESHOLD,
          with_payload: true,
          with_vector: false,
        };
        if (qdrantFilter) {
          searchConfig.filter = qdrantFilter;
        }
        const rawHits = await sync.client.search(sync.collectionName, searchConfig);

        // Client-side dedup: max GROUP_SIZE per source document
        const sourceCounts = {};
        for (const hit of rawHits) {
          const src = hit.payload && hit.payload.source;
          if (!src || (sourceCounts[src] || 0) >= GROUP_SIZE) continue;
          sourceCounts[src] = (sourceCounts[src] || 0) + 1;
          hits.push(hit);
        }
        groupCount = Object.keys(sourceCounts).length;
      } catch (searchErr) {
        console.warn('[qdrant] search also failed, returning empty:', searchErr.message);
      }
    }

    // Log totals before threshold filtering
    const totalResults = hits.length;
    console.log('[qdrant] results: %d total, %d above threshold', totalResults, hits.filter(h => h.score >= SCORE_THRESHOLD).length);

    // Apply score threshold filter
    let rankedHits = hits.filter(hit => hit.score >= SCORE_THRESHOLD);

    // Fallback: if fewer than 2 results above threshold, retry with lowered threshold
    if (rankedHits.length < 2 && totalResults > 0) {
      console.log(`[qdrant] fallback: only ${rankedHits.length} results above ${SCORE_THRESHOLD.toFixed(2)}, retrying with ${FALLBACK_THRESHOLD.toFixed(2)}`);
      rankedHits = hits.filter(hit => hit.score >= FALLBACK_THRESHOLD);
    }

    // Sort by score descending and limit to LIMIT results
    const ranked = rankedHits
      .sort((a, b) => b.score - a.score)
      .slice(0, LIMIT)
      .map(hit => ({ ...hit.payload, score: hit.score }));

    const elapsed = Date.now() - t0;
    console.log(`[qdrant] group_by: groups=${groupCount}, chunks=${totalResults} (threshold=${SCORE_THRESHOLD.toFixed(2)} → ${rankedHits.length} above), in ${elapsed}ms`);

    console.log(JSON.stringify({ query, project_id, results: ranked }, null, 2));
    return;
  }

  if (args[0] === 'snippet' && args[1] === 'search') {
    const query = args[2] || '';
    const options = {};

    for (let i = 3; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].slice(2);
        const value = args[i + 1];
        if (key === 'tags' && value) options.tags = value.split(',');
        if (key === 'language' && value) options.language = value;
        if (key === 'type' && value) options.type = value;
        if (key === 'context') options.withContext = true;
        if (key === 'limit' && value) options.limit = parseInt(value, 10);
      }
    }

    if (!query) {
      console.log('❌ Please provide a search query.');
      console.log('Usage: gsd-qdrant-knowledge snippet search <query> [--tags <tag1,tag2>] [--language <lang>] [--type <type>] [--context] [--limit <n>]');
      process.exit(1);
    }

    const runtimeSyncPath = join(PROJECT_ROOT, TOOL_DIR_NAME, 'index.js');
    const useQdrant = existsSync(runtimeSyncPath);
    let sorted = [];

    if (useQdrant) {
      try {
        const { GSDKnowledgeSync } = require(runtimeSyncPath);
        const sync = new GSDKnowledgeSync();
        await sync.init();
        sorted = await sync.searchWithContext(query, {
          limit: options.limit || 10,
          type: options.type || undefined,
        });
      } catch (err) {
        console.log('⚠️  Qdrant search failed, falling back to local database:', err.message);
      }
    }

    if (sorted.length === 0) {
      const snippetRanking = require(findFileInCliRoot('snippet-ranking'));
      const snippets = snippetRanking.loadDatabase();
      const filtered = snippetRanking.filterAndRankSnippets(snippets, query, options);
      sorted = snippetRanking.sortSnippetsByRelevance(filtered);
    }

    console.log('🔍 Snippet Search');
    console.log('='.repeat(50));
    console.log(`Query: "${query}"`);
    if (options.withContext) console.log('With Context: Yes');
    console.log(`Found ${sorted.length} results:`);

    sorted.forEach((result, i) => {
      console.log(`  ${i + 1}. ${result.path || result.name} (score: ${result.score || result.relevanceScore})`);
      console.log(`     Type: ${result.type}, Scope: ${result.scope}`);
      if (result.milestone || result.slice || result.task) {
        console.log(`     GSD: ${result.milestone || ''} ${result.slice || ''} ${result.task || ''}`.trim());
      }
      console.log(`     ${result.content?.slice(0, 200) || 'No content'}`);
      if (result.context && result.context.length > 0) {
        console.log(`     Context: ${result.context.length} related documents`);
        result.context.forEach(ctx => {
          console.log(`       - ${ctx.source} (${ctx.ids.length} IDs: ${ctx.ids.slice(0, 3).join(', ')})`);
        });
      }
    });

    console.log('='.repeat(50));
    console.log('✅ Search complete!');
    return;
  }

  if (args[0] === 'snippet' && args[1] === 'apply') {
    const query = args[2] || '';

    if (!query) {
      console.log('❌ Please provide a query for the snippet to apply.');
      console.log('Usage: gsd-qdrant-knowledge snippet apply <query>');
      process.exit(1);
    }

    const snippetRanking = require(findFileInCliRoot('snippet-ranking'));
    const intentDetector = require(findFileInCliRoot('intent-detector'));
    const contextAnalyzer = require(findFileInCliRoot('context-analyzer'));
    const intent = intentDetector.detectIntent(query);
    const snippets = snippetRanking.loadDatabase();
    const filtered = snippetRanking.filterAndRankSnippets(snippets, intent.query, {
      tags: intent.filters.tags || [],
      language: (intent.filters.language && !intent.filters.tags?.includes(intent.filters.language)) ? intent.filters.language : '',
      type: intent.filters.type || '',
      crossProject: intent.filters.crossProject || true
    });
    const sorted = snippetRanking.sortSnippetsByRelevance(filtered);

    console.log('📝 Snippet Apply');
    console.log('='.repeat(50));
    console.log(`Query: "${query}"`);

    if (sorted.length === 0) {
      console.log('\n⚠️  No matching snippets found.');
      console.log('='.repeat(50));
      console.log('✅ Search complete (no results)');
      process.exit(0);
    }

    const topMatch = sorted[0];
    const projectContext = contextAnalyzer.analyzeProjectContext();
    const placement = contextAnalyzer.recommendCodePlacement(topMatch.description || query, projectContext);
    const fileExtension = getExtensionForLanguage(topMatch.language);
    const baseFileName = topMatch.sourceFile ? basename(topMatch.sourceFile).replace(extname(topMatch.sourceFile), '') : 'snippet';
    const fileName = `${baseFileName}${fileExtension}`;
    const filePath = join(PROJECT_ROOT, placement.path, fileName);

    let willOverwrite = false;
    if (existsSync(filePath)) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const timeout = setTimeout(() => {
        console.log('\n⚠️  No user input received, defaulting to overwrite.');
        willOverwrite = true;
        rl.close();
      }, 1000);

      await new Promise((resolve) => {
        rl.question('Would you like to overwrite it? (y/N): ', (answer) => {
          clearTimeout(timeout);
          const response = answer.toLowerCase().trim();
          willOverwrite = response === 'y' || response === 'yes';
          rl.close();
          resolve();
        });
      });

      if (!willOverwrite) {
        console.log('❌ File not created (user declined to overwrite).');
        console.log('✅ Operation cancelled.');
        process.exit(0);
      }
    } else {
      const dirPath = dirname(filePath);
      if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
    }

    writeFileSync(filePath, topMatch.content, 'utf8');
    console.log(`✅ File created successfully: ${filePath}`);
    return;
  }

  await bootstrapProject();
}

main();
