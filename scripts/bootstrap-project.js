const { spawnSync } = require('child_process');
const { join } = require('path');

const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = process.cwd();
const API_DIR = join(PROJECT_ROOT, 'apps', 'api');
const ROOT_PKG = join(PROJECT_ROOT, 'package.json');
const API_PKG = join(API_DIR, 'package.json');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function exists(path) {
  return require('fs').existsSync(path);
}

function installDependencies() {
  if (exists(API_PKG)) {
    console.log('\n📦 Installing dependencies in apps/api...');
    run('npm', ['install'], { cwd: API_DIR });
    return;
  }

  if (exists(ROOT_PKG)) {
    console.log('\n📦 Installing dependencies in project root...');
    run('npm', ['install'], { cwd: PROJECT_ROOT });
    return;
  }

  console.log('\n⚠️  No package.json found. Skipping npm install.');
}

function initialSync() {
  if (exists(API_PKG)) {
    console.log('\n🧠 Running initial knowledge sync in apps/api...');
    run('npm', ['run', 'sync-knowledge'], { cwd: API_DIR });
    return;
  }

  if (exists(ROOT_PKG)) {
    console.log('\n🧠 Running initial knowledge sync in project root...');
    run('npm', ['run', 'sync-knowledge'], { cwd: PROJECT_ROOT });
    return;
  }

  console.log('\n⚠️  No package.json found. Skipping initial sync.');
}

function main() {
  console.log('🚀 Bootstrapping project with GSD + Qdrant template...');
  run('node', [join(SCRIPT_DIR, 'setup-from-templates.js')], { cwd: PROJECT_ROOT });
  installDependencies();
  initialSync();

  console.log('\n✅ Bootstrap complete.');
  console.log('\nNext step: run your project normally (for example `npm run dev`).');
}

main();
