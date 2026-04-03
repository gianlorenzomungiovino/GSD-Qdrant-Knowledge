#!/usr/bin/env node

/**
 * Sync knowledge to Qdrant
 * 
 * This script syncs GSD knowledge to Qdrant vector database.
 */

const { GSDKnowledgeSync } = require('./lib/gsd-qdrant-sync');

async function main() {
  const sync = new GSDKnowledgeSync();
  await sync.init();
  
  const action = process.argv[2];
  if (action === 'watch') {
    sync.startWatcher();
    console.log('🧠 Running in watch mode...');
  } else {
    await sync.sync();
    console.log('✅ Sync complete!');
  }
}

main().catch((err) => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});