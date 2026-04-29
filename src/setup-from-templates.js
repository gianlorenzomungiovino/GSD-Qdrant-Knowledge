#!/usr/bin/env node

const { QdrantClient } = require('@qdrant/js-client-rest');
const fs = require('fs');
const { readFile, writeFile } = require('fs/promises');
const { join, basename, dirname } = require('path');

const existsSync = fs.existsSync;

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const VECTOR_NAME = process.env.VECTOR_NAME || 'codebert-768';
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10);
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
    let collectionExists = false;

    try {
      const existing = await client.getCollection(COLLECTION_NAME);
      const vectors = existing?.config?.params?.vectors;

      // Check if the named vector matches expected name and dimensions
      const namedVector = vectors && !Array.isArray(vectors) ? vectors[VECTOR_NAME] : null;
      if (namedVector && namedVector.size === EMBEDDING_DIMENSIONS) {
        console.log(`ℹ️  Collection ${COLLECTION_NAME} already exists with correct vector (${VECTOR_NAME}, size=${EMBEDDING_DIMENSIONS})`);
        collectionExists = true;
      } else {
        // Vector name or size mismatch — need to recreate
        if (namedVector) {
          console.log(`⚠️  Collection ${COLLECTION_NAME} exists but vector mismatch: found '${VECTOR_NAME}' with size=${namedVector.size}, expected size=${EMBEDDING_DIMENSIONS}. Recreating...`);
        } else {
          const existingNames = vectors && !Array.isArray(vectors) ? Object.keys(vectors).join(', ') : 'unnamed';
          console.log(`⚠️  Collection ${COLLECTION_NAME} exists but missing vector '${VECTOR_NAME}' (has: ${existingNames || 'none'}). Recreating...`);
        }

        // Delete and recreate with correct config
        await client.deleteCollection(COLLECTION_NAME);
      }
    } catch (getErr) {
      if (getErr.status !== 404) throw getErr;
    }

    if (!collectionExists) {
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          [VECTOR_NAME]: {
            size: EMBEDDING_DIMENSIONS,
            distance: 'Cosine',
          },
        },
      });
      console.log(`✅ Created collection: ${COLLECTION_NAME} (unified)`);
    }
  } catch (err) {
    console.warn(`⚠️  Could not create ${COLLECTION_NAME}: ${err.message}`);
  }
}

async function ensureKnowledgeInstructions() {
  const instructionsPath = join(__dirname, 'knowledge-instructions.js');
  if (!existsSync(instructionsPath)) {
    console.warn('⚠️  knowledge-instructions.js not found, skipping KNOWLEDGE.md setup');
    return;
  }

  try {
    const { ensureKnowledgeInstructions: createInstructions } = require(instructionsPath);
    createInstructions();
  } catch (err) {
    console.warn(`⚠️  KNOWLEDGE.md setup failed: ${err.message}`);
  }
}

async function setup() {
  const client = new QdrantClient({ url: QDRANT_URL });

  console.log('🔧 Preparing project for Qdrant sync...');

  await ensureProjectCollections(client);
  await installPostCommitHook(PROJECT_ROOT);
  await ensureKnowledgeInstructions();

  console.log('\n✅ Setup ready.');
  console.log(`   Collection '${COLLECTION_NAME}' is ready for unified indexing.`);
}

setup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Setup failed:', err.message);
    process.exit(1);
  });
