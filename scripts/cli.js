#!/usr/bin/env node

/**
 * GSD + Qdrant CLI - Main entry point
 * 
 * Installabile globalmente con: npm install -g ./qdrant-template
 * Usabile in qualsiasi progetto Node.js con: gsd-qdrant
 * 
 * Risolve il problema originale: installa le dipendenze PRIMA di eseguire qualsiasi cosa
 */

const { spawnSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = process.cwd();
const ROOT_PKG = join(PROJECT_ROOT, 'package.json');
const API_PKG = join(PROJECT_ROOT, 'apps', 'api', 'package.json');

// Required packages for setup - these are needed BEFORE running setup
const REQUIRED_PACKAGES = [
  '@qdrant/js-client-rest',
  '@xenova/transformers'
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
    ...options,
  });
}

function findPackagePath() {
  if (existsSync(API_PKG)) return API_PKG;
  if (existsSync(ROOT_PKG)) return ROOT_PKG;
  return null;
}

function installDependencies(pkgPath) {
  const pkgDir = pkgPath.replace(/\\/g, '/');
  const target = pkgPath.includes('apps/api') ? 'apps/api' : 'project root';
  
  console.log(`\n📦 Installing required dependencies in ${target}...`);
  run('npm', ['install', ...REQUIRED_PACKAGES], { cwd: pkgDir });
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('🚀 GSD + Qdrant CLI');
    console.log('==================\n');

    // Find which package.json to use
    const pkgPath = findPackagePath();
    if (!pkgPath) {
      console.error('❌ No package.json found. Are you in a Node.js project?');
      process.exit(1);
    }

    const apiDir = existsSync(API_PKG) ? 'apps/api' : null;
    console.log(`📁 Using: ${apiDir || 'project root'}`);

    // Install required packages FIRST (this is the key fix!)
    installDependencies(pkgPath);

    // Run setup from templates
    console.log('\n🔧 Running setup...');
    run('node', [join(SCRIPT_DIR, 'setup-from-templates.js')], { cwd: PROJECT_ROOT });

    // Run initial sync
    console.log('\n🧠 Running initial knowledge sync...');
    const syncDir = apiDir ? 'apps/api' : PROJECT_ROOT;
    run('npm', ['run', 'sync-knowledge'], { cwd: syncDir });

    console.log('\n✅ Setup complete!');
    console.log('\nNext step: run your project normally (e.g., `npm run dev`).');
  } else if (args[0] === 'snippet' && args[1] === 'search') {
    // Snippet search command
    const query = args[2] || '';
    const options = {};
    
    // Parse flags
    for (let i = 3; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].slice(2);
        const value = args[i + 1];
        if (key === 'tags') options.tags = value.split(',');
        if (key === 'language') options.language = value;
        if (key === 'type') options.type = value;
      }
    }
    
    if (!query) {
      console.log('❌ Please provide a search query.');
      console.log('Usage: gsd-qdrant snippet search <query> [--tags <tag1,tag2>] [--language <lang>] [--type <type>]');
      process.exit(1);
    }
    
    // Load and search snippets
    const snippetRanking = require('./snippet-ranking');
    const snippets = snippetRanking.loadDatabase();
    
    const filtered = snippetRanking.filterAndRankSnippets(snippets, query, options);
    const sorted = snippetRanking.sortSnippetsByRelevance(filtered);
    
    console.log('🔍 Snippet Search');
    console.log('='.repeat(50));
    console.log(`Query: "${query}"`);
    console.log(`Found ${sorted.length} results:`);
    
    sorted.forEach((snippet, i) => {
      console.log(`  ${i + 1}. ${snippet.name} (score: ${snippet.relevanceScore})`);
      console.log(`     Type: ${snippet.type}, Language: ${snippet.language}`);
      console.log(`     Source: ${snippet.sourceFile}: ${snippet.sourceLine}`);
      console.log(`     Description: ${snippet.description}`);
    });
    
    console.log('='.repeat(50));
    console.log('✅ Search complete!');
  } else {
    // Default behavior - run setup
    console.log('🚀 GSD + Qdrant CLI');
    console.log('==================\n');

    // Find which package.json to use
    const pkgPath = findPackagePath();
    if (!pkgPath) {
      console.error('❌ No package.json found. Are you in a Node.js project?');
      process.exit(1);
    }

    const apiDir = existsSync(API_PKG) ? 'apps/api' : null;
    console.log(`📁 Using: ${apiDir || 'project root'}`);

    // Install required packages FIRST (this is the key fix!)
    installDependencies(pkgPath);

    // Run setup from templates
    console.log('\n🔧 Running setup...');
    run('node', [join(SCRIPT_DIR, 'setup-from-templates.js')], { cwd: PROJECT_ROOT });

    // Run initial sync
    console.log('\n🧠 Running initial knowledge sync...');
    const syncDir = apiDir ? 'apps/api' : PROJECT_ROOT;
    run('npm', ['run', 'sync-knowledge'], { cwd: syncDir });

    console.log('\n✅ Setup complete!');
    console.log('\nNext step: run your project normally (e.g., `npm run dev`).');
  }
}

main();
