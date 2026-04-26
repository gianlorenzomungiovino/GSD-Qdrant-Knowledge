#!/usr/bin/env node

/**
 * Sync knowledge to Qdrant
 * 
 * This script syncs GSD knowledge to Qdrant vector database.
 * Uses unified collection 'gsd_memory' for all content.
 */

const path = require('path');
const { GSDKnowledgeSync } = require('./gsd-qdrant-template.js');

async function main() {
  const sync = new GSDKnowledgeSync();
  await sync.init();
  
  const action = process.argv[2];
  if (action === 'watch') {
    sync.startWatcher();
    console.log('🧠 Running in watch mode...');
  } else if (action === 'setup') {
    await sync.ensureCollection(sync.collectionName);
    console.log(`✅ Collection '${sync.collectionName}' is ready`);
    console.log('🔄 Running initial full sync with orphan cleanup...');
    const summary = await sync.syncToGsdMemory();
    console.log(`✅ Initial sync complete! Indexed: ${summary.total}, Deleted orphans: ${summary.deleted}`);
  } else {
    await sync.syncToGsdMemory();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Sync failed:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  });