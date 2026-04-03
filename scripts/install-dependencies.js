#!/usr/bin/env node

/**
 * Install dependencies for GSD + Qdrant CLI
 * 
 * This script installs required packages before running setup.
 */

const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

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
  return result;
}

function installDependencies(pkgPath) {
  const pkgDir = pkgPath.replace(/\\/g, '/');
  const target = pkgPath.includes('apps/api') ? 'apps/api' : 'project root';
  
  console.log(`\n📦 Installing required dependencies in ${target}...`);
  run('npm', ['install', ...REQUIRED_PACKAGES], { cwd: pkgDir });
}

function findPackagePath(projectRoot = process.cwd()) {
  const apiPkg = join(projectRoot, 'apps', 'api', 'package.json');
  const rootPkg = join(projectRoot, 'package.json');
  
  if (existsSync(apiPkg)) return apiPkg;
  if (existsSync(rootPkg)) return rootPkg;
  return null;
}

function main() {
  console.log('🚀 Installing dependencies...');
  
  const pkgPath = findPackagePath();
  if (!pkgPath) {
    console.error('❌ No package.json found. Are you in a Node.js project?');
    process.exit(1);
  }

  installDependencies(pkgPath);
  
  console.log('✅ Dependencies installed!');
}

main();