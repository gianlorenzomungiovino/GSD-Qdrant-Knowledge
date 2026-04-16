#!/usr/bin/env node

/**
 * Install GSD Auto-Retrieve Extension
 *
 * Installa i file runtime del tool nella directory gsd-qdrant-knowledge/
 * senza creare strutture annidate inutili sotto agent/extensions/gsd.
 */

const { existsSync, mkdirSync, copyFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const PROJECT_ROOT = process.cwd();
const GSD_QDRANT_DIR = join(PROJECT_ROOT, 'gsd-qdrant-knowledge');

function installExtension() {
  const extensionSource = join(__dirname, 'auto-retrieve-mcp.js');
  const extensionDest = join(GSD_QDRANT_DIR, 'auto-retrieve-mcp.js');

  if (!existsSync(GSD_QDRANT_DIR)) {
    mkdirSync(GSD_QDRANT_DIR, { recursive: true });
    console.log('📂 Created directory: gsd-qdrant-knowledge/');
  }

  if (!existsSync(extensionSource)) {
    console.log('⚠️  Extension source not found:', extensionSource);
    return false;
  }

  const needsCopy = !existsSync(extensionDest);
  copyFileSync(extensionSource, extensionDest);
  if (needsCopy) {
    console.log('📝 Created: gsd-qdrant-knowledge/auto-retrieve-mcp.js');
  }

  const markerFile = join(GSD_QDRANT_DIR, '.extension-installed.json');
  writeFileSync(markerFile, JSON.stringify({ installedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');

  return true;
}

const success = installExtension();
if (success) {
  console.log('✅ Auto-retrieve runtime installed successfully');
} else {
  console.log('⚠️  Extension installation failed');
  process.exit(1);
}
