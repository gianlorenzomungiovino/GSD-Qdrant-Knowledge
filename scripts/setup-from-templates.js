#!/usr/bin/env node

const { QdrantClient } = require('@qdrant/js-client-rest');
const fs = require('fs');
const { readFile, writeFile } = require('fs/promises');
const { join, basename } = require('path');

const existsSync = fs.existsSync;

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const VECTOR_NAME = process.env.VECTOR_NAME || 'fast-all-minilm-l6-v2';
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '384', 10);
const PROJECT_ROOT = process.cwd();
const PROJECT_NAME = basename(PROJECT_ROOT.replace(/\\/g, '/'));
const COLLECTIONS = {
  docs: `${PROJECT_NAME}-docs`,
  snippets: `${PROJECT_NAME}-snippets`,
};

async function installPostCommitHook(projectRoot) {
  const hooksDir = join(projectRoot, '.git', 'hooks');
  if (!existsSync(hooksDir)) return;

  const hookPath = join(hooksDir, 'post-commit');
  const hookContent = `#!/bin/sh
# Auto-sync GSD knowledge to Qdrant after each local commit.

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$PROJECT_ROOT" ] && exit 0
cd "$PROJECT_ROOT" || exit 0
node scripts/sync-knowledge.js >/dev/null 2>&1 || echo "[qdrant-sync] sync-knowledge failed" >&2
`;

  try {
    const existing = await readFile(hookPath, 'utf8');
    if (existing === hookContent) return;
  } catch (_err) {}

  await writeFile(hookPath, hookContent, { mode: 0o755 });
  console.log('📝 Post-commit hook updated');
}

async function ensureProjectCollections(client) {
  console.log(`🗄️ Collections: ${COLLECTIONS.docs}, ${COLLECTIONS.snippets}`);
  for (const [type, collectionName] of Object.entries(COLLECTIONS)) {
    try {
      try {
        await client.getCollection(collectionName);
        console.log(`ℹ️  Collection ${collectionName} already exists`);
        continue;
      } catch (getErr) {
        if (getErr.status !== 404) throw getErr;
      }

      await client.createCollection(collectionName, {
        vectors: {
          [VECTOR_NAME]: {
            size: EMBEDDING_DIMENSIONS,
            distance: 'Cosine',
          },
        },
      });
      console.log(`✅ Created collection: ${collectionName} (${type})`);
    } catch (err) {
      console.warn(`⚠️  Could not create ${collectionName}: ${err.message}`);
    }
  }
}

async function setup() {
  const client = new QdrantClient({ url: QDRANT_URL });

  console.log('🔧 Preparing project for Qdrant sync...');

  await ensureProjectCollections(client);
  await installPostCommitHook(PROJECT_ROOT);

  console.log('\n✅ Setup ready.');
  console.log('   Collections are ready and `gsd-qdrant` will sync docs + code.');
}

setup().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
