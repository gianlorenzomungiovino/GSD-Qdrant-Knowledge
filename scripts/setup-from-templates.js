const { QdrantClient } = require('@qdrant/js-client-rest');
const fs = require('fs');
const { readFile, writeFile, mkdir } = require('fs/promises');
const { join, basename, dirname, resolve } = require('path');

const existsSync = fs.existsSync;

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const TEMPLATE_COLLECTION = 'gsd-setup-templates';
const VECTOR_NAME = process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
const EMBEDDING_DIMENSIONS = process.env.EMBEDDING_DIMENSIONS || '384';

function getProjectName(projectRoot) {
  try {
    const pkgPath = join(projectRoot, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) return pkg.name;
    }
  } catch (_e) {}
  return basename(projectRoot.replace(/\\/g, '/'));
}

function findProjectRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    try {
      const pkgPath = join(dir, 'package.json');
      if (existsSync(pkgPath)) return dir;
    } catch (_e) {}
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function getApiDir(projectRoot) {
  const appsApi = join(projectRoot, 'apps', 'api');
  if (existsSync(appsApi)) return appsApi;
  return projectRoot;
}

function getPackageJsonPath(projectRoot, apiDir) {
  const apiPkg = join(apiDir, 'package.json');
  if (existsSync(apiPkg)) return apiPkg;
  return join(projectRoot, 'package.json');
}

async function installPostCommitHook(projectRoot, apiDir) {
  const hooksDir = join(projectRoot, '.git', 'hooks');
  if (!existsSync(hooksDir)) {
    console.warn('⚠️  .git/hooks not found, skipping post-commit hook install');
    return;
  }

  const relApiDir = apiDir.replace(projectRoot, '').replace(/^[/\\]/, '');
  const hookPath = join(hooksDir, 'post-commit');
  const hookContent = `#!/bin/sh
# Auto-sync GSD knowledge to Qdrant after each local commit.

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$PROJECT_ROOT" ] && exit 0

TARGET_DIR="$PROJECT_ROOT/${relApiDir || '.'}"
if [ -f "$TARGET_DIR/package.json" ]; then
  cd "$TARGET_DIR" || exit 0
  npm run sync-knowledge >/dev/null 2>&1 || echo "[qdrant-sync] sync-knowledge failed" >&2
fi
`;

  await writeFile(hookPath, hookContent, { mode: 0o755 });
  console.log('📝 Installed .git/hooks/post-commit');
}

async function patchServerForWatcher(apiDir) {
  const serverPath = join(apiDir, 'src', 'server.js');
  if (!existsSync(serverPath)) {
    console.warn('⚠️  src/server.js not found, skipping watcher auto-start patch');
    return;
  }

  let content = await readFile(serverPath, 'utf-8');

  if (!content.includes("const { GSDKnowledgeSync } = require('./lib/gsd-qdrant-sync');")) {
    content = content.replace(
      /const healthRouter = require\((['"])\.\/routes\/health\1\);/,
      `const healthRouter = require('./routes/health');\nconst { GSDKnowledgeSync } = require('./lib/gsd-qdrant-sync');`
    );
  }

  if (!content.includes('Qdrant knowledge watcher started in non-production mode.')) {
    content = content.replace(
      /app\.listen\(PORT, \(\) => \{([\s\S]*?)\n\}\);/,
      `app.listen(PORT, () => {$1

  const isNonProduction = process.env.NODE_ENV !== "production";
  if (isNonProduction) {
    const knowledgeSync = new GSDKnowledgeSync();
    knowledgeSync
      .init()
      .then(() => {
        knowledgeSync.startWatcher();
        console.log("Qdrant knowledge watcher started in non-production mode.");
      })
      .catch((err) => {
        console.error("Failed to start Qdrant knowledge watcher:", err.message);
      });
  }
});`
    );
  }

  await writeFile(serverPath, content);
  console.log(`📝 Patched ${serverPath} for watcher auto-start`);
}

const PROJECT_ROOT = findProjectRoot();
const API_DIR = getApiDir(PROJECT_ROOT);
const PROJECT_NAME = getProjectName(PROJECT_ROOT);
const PROJECT_COLLECTION = `${PROJECT_NAME}-gsd`;

console.log(`🚀 Setting up GSD Qdrant integration from templates...\n`);
console.log(`📁 Project root: ${PROJECT_ROOT}`);
console.log(`📁 API dir: ${API_DIR}`);
console.log(`📛 Project name: ${PROJECT_NAME}`);
console.log(`🗄️  Qdrant collection: ${PROJECT_COLLECTION}`);
console.log(`🧠 MCP vector name: ${VECTOR_NAME}\n`);

async function setup() {
  const client = new QdrantClient({ url: QDRANT_URL });

  console.log('📥 Downloading templates from Qdrant...');
  const { points } = await client.scroll(TEMPLATE_COLLECTION, {
    limit: 100,
    with_payload: true,
    with_vectors: false,
  });

  if (!points || points.length === 0) {
    throw new Error('No templates found in collection ' + TEMPLATE_COLLECTION);
  }

  console.log(`Found ${points.length} template files.\n`);

  for (const point of points) {
    const payload = point.payload;
    const filePath = payload.path.replace(/\\/g, '/');
    const content = payload.content;

    let targetPath;
    if (filePath.endsWith('mcp.json.template')) {
      targetPath = join(PROJECT_ROOT, '.gsd', 'mcp.json');
      const modified = content
        .replace(/<PROJECT_NAME>-gsd/g, `${PROJECT_NAME}-gsd`)
        .replace(/<VECTOR_NAME>/g, VECTOR_NAME)
        .replace(/<EMBEDDING_MODEL>/g, EMBEDDING_MODEL)
        .replace(/<EMBEDDING_DIMENSIONS>/g, EMBEDDING_DIMENSIONS);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, modified);
      console.log('📝 Created .gsd/mcp.json');
    } else if (filePath.includes('lib/gsd-qdrant-sync/')) {
      targetPath = join(API_DIR, 'src', 'lib', 'gsd-qdrant-sync', 'index.js');
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content);
      console.log(`📝 Created ${targetPath}`);
    } else if (filePath === 'README.md') {
      targetPath = join(PROJECT_ROOT, 'GSQ-QDRANT-SETUP.md');
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content);
      console.log(`📝 Created ${targetPath} (setup instructions)`);
    }
  }

  const pkgPath = getPackageJsonPath(PROJECT_ROOT, API_DIR);
  try {
    const pkgContent = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    pkg.scripts = pkg.scripts || {};
    pkg.scripts['sync-knowledge'] = 'node src/lib/gsd-qdrant-sync/index.js sync';
    pkg.scripts['sync-knowledge:watch'] = 'node src/lib/gsd-qdrant-sync/index.js watch';
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies['@qdrant/js-client-rest'] = '^1.17.0';
    pkg.dependencies['@xenova/transformers'] = '^2.17.2';
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`📝 Updated ${pkgPath}`);
  } catch (_e) {
    console.warn('⚠️  Could not update package.json (not found or invalid)');
  }

  await installPostCommitHook(PROJECT_ROOT, API_DIR);
  await patchServerForWatcher(API_DIR);

  console.log('\n✅ Setup complete!');
  console.log('\nWhat is automatic now:');
  console.log('1. Every local git commit runs sync-knowledge via post-commit hook');
  console.log('2. In any non-production environment, the app auto-starts the Qdrant watcher when src/server.js exists');
  console.log(`3. Project MCP searches collection: ${PROJECT_COLLECTION}`);
  console.log(`4. MCP and sync agree on named vector: ${VECTOR_NAME}`);
}

setup().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
