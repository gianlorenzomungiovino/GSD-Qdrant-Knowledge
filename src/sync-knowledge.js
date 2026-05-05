#!/usr/bin/env node

/**
 * Sync knowledge to Qdrant
 * 
 * This script syncs GSD knowledge to Qdrant vector database.
 * Uses unified collection 'gsd_memory' for all content.
 */

const { promises: fs } = require('fs');
const path = require('path');
const { GSDKnowledgeSync } = require('./gsd-qdrant-template.js');

function printHelp() {
  console.log(`Usage: node src/sync-knowledge.js [command] [options]

Commands:
  setup       Ensure collection exists and run initial full sync with orphan cleanup
  watch       Run in file-watcher mode (not yet implemented)
  <default>   Run a regular incremental sync

Options:
  --help          Show this help message
  --force-reindex Delete ALL points for the current project before syncing.
                  Use when migrating to a new indexing format or cleaning up stale data.`);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Handle flags first (before command detection)
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }
  
  const forceReindex = args.includes('--force-reindex');

  const sync = new GSDKnowledgeSync();
  await sync.init();
  
  // Get the command (first non-flag argument)
  let action = null;
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      action = arg;
      break;
    }
  }

  if (forceReindex && action !== 'setup') {
    // Force re-index: clear all project points first, then sync fresh
    const beforeCount = await sync.client.count(sync.collectionName);
    console.log(`[reindex] Before count for collection '${sync.collectionName}': ${beforeCount.count || 0}`);
    
    const deleted = await sync.clearAllProjectPoints();
    console.log(`[reindex] Cleared ${deleted} point(s) before fresh indexing`);
    
    // Reset sync state to force full re-index of all files
    try { 
      const STATE_FILE = path.join(process.cwd(), 'gsd-qdrant-knowledge', '.qdrant-sync-state.json');
      await fs.writeFile(STATE_FILE, JSON.stringify({ lastSync: null, indexed: {} }, null, 2)); 
    } catch (_) {}
    
    const summary = await sync.syncToGsdMemory();
    
    const afterCount = await sync.client.count(sync.collectionName);
    console.log(`[reindex] After count for collection '${sync.collectionName}': ${afterCount.count || 0}`);
    console.log(`Force re-index complete! Indexed: ${summary.total}, Deleted orphans: ${summary.deleted}`);
    
    return;
  }

  if (action === 'watch') {
    sync.startWatcher();
    console.log('Running in watch mode...');
  } else if (action === 'setup') {
    await sync.ensureCollection(sync.collectionName);
    console.log(`Collection '${sync.collectionName}' is ready`);
    console.log('Running initial full sync with orphan cleanup...');
    const summary = await sync.syncToGsdMemory();
    console.log(`Initial sync complete! Indexed: ${summary.total}, Deleted orphans: ${summary.deleted}`);
  } else {
    await sync.syncToGsdMemory();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Sync failed:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  });
