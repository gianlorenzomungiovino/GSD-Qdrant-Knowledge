#!/usr/bin/env node

/**
 * Install GSD Auto-Retrieve Extension
 * 
 * Questo script installa automaticamente l'estensione GSD che abilita
 * il retrieving automatico del contesto cross-project.
 * 
 * Verrà eseguito automaticamente quando il CLI viene eseguito per la prima volta.
 */

const { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } = require('fs');
const { join, dirname } = require('path');

const PROJECT_ROOT = process.cwd();
const GSD_DIR = join(PROJECT_ROOT, '.gsd');
const EXTENSIONS_DIR = join(GSD_DIR, 'agent', 'extensions', 'gsd');
const INDEX_FILE = join(EXTENSIONS_DIR, 'index.js');

/**
 * Reads the current index.js content
 */
function readIndexFile() {
  if (!existsSync(INDEX_FILE)) {
    return null;
  }
  return readFileSync(INDEX_FILE, 'utf8');
}

/**
 * Checks if the auto-retrieve hook is already installed
 */
function isAutoRetrieveInstalled(indexContent) {
  if (!indexContent) return false;
  return indexContent.includes('auto-retrieve-mcp.js');
}

/**
 * Installs the auto-retrieve extension
 */
function installExtension() {
  const extensionSource = join(__dirname, 'auto-retrieve-mcp.js');
  const extensionDest = join(EXTENSIONS_DIR, 'auto-retrieve-mcp.js');
  
  // Create directories if they don't exist
  if (!existsSync(EXTENSIONS_DIR)) {
    mkdirSync(EXTENSIONS_DIR, { recursive: true });
    console.log('📂 Created directory: .gsd/agent/extensions/gsd/');
  }
  
  // Copy extension file
  if (existsSync(extensionSource)) {
    copyFileSync(extensionSource, extensionDest);
    console.log('📝 Created: .gsd/agent/extensions/gsd/auto-retrieve-mcp.js');
  } else {
    console.log('⚠️  Extension source not found:', extensionSource);
    return false;
  }
  
  // Update index.js if it exists
  const indexContent = readIndexFile();
  if (indexContent) {
    if (isAutoRetrieveInstalled(indexContent)) {
      console.log('ℹ️  Auto-retrieve extension already installed');
      return true;
    }
    
    // Add auto-retrieve hook loading
    const newContent = indexContent.replace(
      'export default async function registerExtension(pi) {',
      `export default async function registerExtension(pi) {
    // Load auto-retrieve MCP hook for automatic cross-project knowledge retrieval
    try {
        const autoRetrieveMcp = await import("./auto-retrieve-mcp.js");
        autoRetrieveMcp.default(pi, { enabled: true });
    } catch (err) {
        console.warn('[GSD] Auto-retrieve MCP hook failed to load:', err.message);
    }
`
    );
    
    writeFileSync(INDEX_FILE, newContent, 'utf8');
    console.log('📝 Updated: .gsd/agent/extensions/gsd/index.js');
  } else {
    console.log('ℹ️  index.js not found - extension will be loaded manually');
  }
  
  return true;
}

// Run installation
const success = installExtension();
if (success) {
  console.log('✅ Auto-retrieve extension installed successfully');
} else {
  console.log('⚠️  Extension installation failed');
  process.exit(1);
}
