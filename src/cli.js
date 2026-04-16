#!/usr/bin/env node

/**
 * GSD + Qdrant CLI - Main entry point
 */

const { spawnSync } = require('child_process');
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
    const result = spawnSync('npm', ['root', '-g']);
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
  const config = {
    [TOOL_MARKER]: TOOL_MARKER_VALUE,
    serverName: MCP_SERVER_NAME,
    mcpServers: {
      [MCP_SERVER_NAME]: {
        command: 'node',
        args: ['./node_modules/gsd-qdrant-knowledge/src/gsd-qdrant-mcp/index.js'],
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
  const current = readJsonFile(ROOT_MCP_FILE, { mcpServers: {} });
  const mcpServers = current.mcpServers && typeof current.mcpServers === 'object' ? current.mcpServers : {};
  const desired = {
    command: 'node',
    args: ['./node_modules/gsd-qdrant-knowledge/src/gsd-qdrant-mcp/index.js'],
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

function uninstallProjectArtifacts() {
  removeRootMcpRegistration();
  if (existsSync(TOOL_DIR)) {
    rmSync(TOOL_DIR, { recursive: true, force: true });
    console.log(`🧹 Removed: ${TOOL_DIR_NAME}/`);
  }
}

async function bootstrapProject() {
  console.log('🚀 GSD + Qdrant CLI\n');
  createGsdQdrantDirectory(PROJECT_ROOT);

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
  await addToGitignore(PROJECT_ROOT, `${TOOL_DIR_NAME}/`);

  const syncScript = findFileInCliRoot('sync-knowledge.js');
  const syncResult = spawnSync('node', [syncScript], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  if (syncResult.status !== 0) {
    console.error('\n❌ Initial knowledge sync failed. Collections may be empty.');
    process.exit(syncResult.status || 1);
  }

  console.log('\n✅ Ready');
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
    const query = args[1] || '';
    const project_id = basename(PROJECT_ROOT);

    if (!query) {
      console.log('❌ Please provide a query for context building.');
      console.log('Usage: gsd-qdrant-knowledge context <query>');
      process.exit(1);
    }

    const sync = new GSDKnowledgeSync();
    await sync.init();
    const vector = await sync.embedText(query);
    const hits = await sync.client.search(sync.collectionName, {
      vector: { name: sync.vectorName, vector },
      limit: 10,
      with_payload: true,
      with_vector: false
    });

    const ranked = hits.map(hit => ({ ...hit.payload, score: hit.score }));
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
