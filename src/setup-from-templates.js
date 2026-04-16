#!/usr/bin/env node

const { QdrantClient } = require('@qdrant/js-client-rest');
const fs = require('fs');
const { readFile, writeFile } = require('fs/promises');
const { join, basename, dirname } = require('path');

const existsSync = fs.existsSync;

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const VECTOR_NAME = process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2';
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '1024', 10);
const PROJECT_ROOT = process.cwd();
const PROJECT_NAME = basename(PROJECT_ROOT.replace(/\\/g, '/'));
const COLLECTION_NAME = 'gsd_memory'; // Unified collection for all projects

async function installPostCommitHook(projectRoot) {
  const hooksDir = join(projectRoot, '.git', 'hooks');
  if (!existsSync(hooksDir)) return;

  // Rileva sistema operativo per scegliere l'hook corretto
  const isWindows = process.platform === 'win32';
  const hookName = isWindows ? 'post-commit.bat' : 'post-commit.sh';
  const hookPath = join(hooksDir, hookName);
  
  // Trova il percorso del modulo setup-from-templates per localizzare gli hook script
  const modulePath = require.resolve('./setup-from-templates.js');
  const moduleRoot = dirname(modulePath);
  
  // Cerca il file di script in ordine di priorità
  const searchPaths = [
    join(moduleRoot, 'hooks', hookName),              // src/hooks/ (npm install)
    join(moduleRoot, '..', hookName),                  // root del package (npm install)
    join(moduleRoot, hookName),                        // src/ (sviluppo)
  ];
  
  let hookContent;
  for (const path of searchPaths) {
    try {
      hookContent = await readFile(path, 'utf8');
      break;
    } catch (err) {
      continue;
    }
  }
  
  if (!hookContent) {
    console.warn(`⚠️  Hook script not found in any expected location`);
    return;
  }

  try {
    const existing = await readFile(hookPath, 'utf8');
    if (existing === hookContent) return;
  } catch (_err) {}

  await writeFile(hookPath, hookContent, { mode: isWindows ? undefined : 0o755 });
  console.log(`📝 Post-commit hook updated (${hookName})`);
}

async function ensureProjectCollections(client) {
  console.log(`🗄️ Collection: ${COLLECTION_NAME}`);
  try {
    try {
      await client.getCollection(COLLECTION_NAME);
      console.log(`ℹ️  Collection ${COLLECTION_NAME} already exists`);
      return;
    } catch (getErr) {
      if (getErr.status !== 404) throw getErr;
    }

    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        [VECTOR_NAME]: {
          size: EMBEDDING_DIMENSIONS,
          distance: 'Cosine',
        },
      },
    });
    console.log(`✅ Created collection: ${COLLECTION_NAME} (unified)`);
  } catch (err) {
    console.warn(`⚠️  Could not create ${COLLECTION_NAME}: ${err.message}`);
  }
}

async function setup() {
  const client = new QdrantClient({ url: QDRANT_URL });

  console.log('🔧 Preparing project for Qdrant sync...');

  await ensureProjectCollections(client);
  await installPostCommitHook(PROJECT_ROOT);

  console.log('\n✅ Setup ready.');
  console.log(`   Collection '${COLLECTION_NAME}' is ready for unified indexing.`);
}

setup().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
