#!/usr/bin/env node

/**
 * QDrant Embedded CLI — standalone management script for embedded QDrant.
 *
 * Usage:
 *   node scripts/qdrant-cli.js start    — Avvia l'embedded QDrant
 *   node scripts/qdrant-cli.js stop     — Ferma l'embedded QDrant
 *   node scripts/qdrant-cli.js sync     — Avvia QDrant → esegui sync → lascia in background
 *   node scripts/qdrant-cli.js status   — Mostra lo stato dell'embedded QDrant
 */

'use strict';

const { EmbeddedQdrant, detectBinary } = require('../src/embedded-qdrant.js');
const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOOL_DIR_NAME = 'gsd-qdrant-knowledge';
const EMBEDDED_MODE_FILE = path.join(process.cwd(), TOOL_DIR_NAME, '.qdrant-mode');
const SYNC_SCRIPT = path.join(process.cwd(), TOOL_DIR_NAME, 'index.js');

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Check if an external QDrant server is healthy.
 */
async function isExternalQdrantHealthy() {
  const url = process.env.QDRANT_URL || 'http://localhost:6333';
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(`${url}/healthz`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve(body.includes('ok') || body.includes('passed'));
      });
    });
    req.on('error', () => { resolve(false); });
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

/**
 * Check if embedded QDrant is currently running.
 */
function isEmbeddedRunning() {
  try {
    const pidFile = path.join(process.cwd(), '.gsd', 'bin', 'qdrant', '.pid');
    if (!fs.existsSync(pidFile)) return false;
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    // Try to signal the process — if it doesn't throw, it's running
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ─── Commands ─────────────────────────────────────────────────────────

/**
 * Start embedded QDrant.
 */
async function cmdStart() {
  const healthy = await isExternalQdrantHealthy();
  if (healthy) {
    console.log('✅ External QDrant server already running at ' + (process.env.QDRANT_URL || 'http://localhost:6333'));
    console.log('   Dashboard: http://localhost:6333/dashboard');
    return;
  }

  if (isEmbeddedRunning()) {
    console.log('⚠️  Embedded QDrant already running. Use `stop` to restart.');
    return;
  }

  console.log('🧠 Starting embedded QDrant...');

  const instance = new EmbeddedQdrant({
    storageDir: process.env.QDRANT_EMBEDDED_DIR || path.join(process.cwd(), '.qdrant-data'),
    port: parseInt(process.env.QDRANT_EMBEDDED_PORT, 10) || 6333,
    autoInstall: true,
    autoCleanup: true,
  });

  await instance.start();

  // Save PID for stop command
  const pidDir = path.join(process.cwd(), '.gsd', 'bin', 'qdrant');
  fs.mkdirSync(pidDir, { recursive: true });
  fs.writeFileSync(path.join(pidDir, '.pid'), String(instance.pid), 'utf8');

  // Set env for child processes
  process.env.QDRANT_URL = instance.url;

  // Write mode flag
  const toolDir = path.join(process.cwd(), TOOL_DIR_NAME);
  fs.mkdirSync(toolDir, { recursive: true });
  fs.writeFileSync(EMBEDDED_MODE_FILE, JSON.stringify({ mode: 'embedded', url: instance.url }), 'utf8');

  console.log(`✅ Embedded QDrant ready at ${instance.url} (PID: ${instance.pid})`);
  console.log('   Dashboard: http://localhost:6333/dashboard');
}

/**
 * Stop embedded QDrant.
 */
async function cmdStop() {
  if (!isEmbeddedRunning()) {
    // Try with EmbeddedQdrant instance (handles stale PID files)
    const instance = new EmbeddedQdrant({
      storageDir: process.env.QDRANT_EMBEDDED_DIR || path.join(process.cwd(), '.qdrant-data'),
      port: parseInt(process.env.QDRANT_EMBEDDED_PORT, 10) || 6333,
      autoInstall: false,
      autoCleanup: false,
    });

    // Manually stop by killing the stored PID
    try {
      const pidFile = path.join(process.cwd(), '.gsd', 'bin', 'qdrant', '.pid');
      if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
        process.kill(pid, 'SIGTERM');
        console.log(`✅ Stopped QDrant (PID: ${pid})`);
        fs.unlinkSync(pidFile);
      } else {
        console.log('ℹ️  No embedded QDrant running.');
      }
    } catch (err) {
      if (err.code === 'ESRCH') {
        console.log('ℹ️  No embedded QDrant running.');
      } else {
        throw err;
      }
    }
    return;
  }

  const pidFile = path.join(process.cwd(), '.gsd', 'bin', 'qdrant', '.pid');
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);

  console.log(`🛑 Stopping embedded QDrant (PID: ${pid})...`);
  process.kill(pid, 'SIGTERM');

  // Wait for graceful shutdown
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { process.kill(pid, 'SIGKILL'); } catch {}
      resolve();
    }, 10_000);

    const checkInterval = setInterval(() => {
      try {
        process.kill(pid, 0); // Does not throw if process exists
      } catch (err) {
        if (err.code === 'ESRCH') {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve();
        }
      }
    }, 200);
  });

  fs.unlinkSync(pidFile);
  console.log('✅ QDrant stopped.');
}

/**
 * Sync: start QDrant → run sync-knowledge → leave running.
 */
async function cmdSync() {
  const healthy = await isExternalQdrantHealthy();
  let instance = null;

  if (!healthy) {
    console.log('🧠 Starting embedded QDrant for sync...');
    instance = new EmbeddedQdrant({
      storageDir: process.env.QDRANT_EMBEDDED_DIR || path.join(process.cwd(), '.qdrant-data'),
      port: parseInt(process.env.QDRANT_EMBEDDED_PORT, 10) || 6333,
      autoInstall: true,
      autoCleanup: false, // We handle cleanup ourselves
    });

    await instance.start();

    const pidDir = path.join(process.cwd(), '.gsd', 'bin', 'qdrant');
    fs.mkdirSync(pidDir, { recursive: true });
    fs.writeFileSync(path.join(pidDir, '.pid'), String(instance.pid), 'utf8');

    process.env.QDRANT_URL = instance.url;

    // Write mode flag
    const toolDir = path.join(process.cwd(), TOOL_DIR_NAME);
    fs.mkdirSync(toolDir, { recursive: true });
    fs.writeFileSync(EMBEDDED_MODE_FILE, JSON.stringify({ mode: 'embedded', url: instance.url }), 'utf8');

    console.log(`✅ Embedded QDrant ready at ${instance.url} (PID: ${instance.pid})`);
  } else {
    console.log('✅ External QDrant server detected — using it for sync.');
  }

  // Run sync-knowledge.js
  const syncScript = path.join(process.cwd(), TOOL_DIR_NAME, 'index.js');
  if (fs.existsSync(syncScript)) {
    console.log('\n🔄 Running sync...');
    const result = spawnSync('node', [syncScript], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env },
    });

    if (result.status !== 0) {
      console.error('\n❌ Sync failed.');
      if (!healthy && instance) {
        // Stop embedded QDrant since sync failed
        await cmdStop();
      }
      process.exit(result.status || 1);
    }
    console.log('✅ Sync complete.');
  } else {
    console.log('\n⚠️  No sync script found at ' + syncScript);
    console.log('   Run `gsd-qdrant-knowledge` first to bootstrap the project.');
  }

  // Leave QDrant running in background (don't stop)
  if (!healthy && instance) {
    console.log(`\n🧠 QDrant left running at ${instance.url} (PID: ${instance.pid})`);
    console.log('   Dashboard: http://localhost:6333/dashboard');
    console.log('   Run `npm run stop-qdrant` to stop it.');
  }
}

/**
 * Status: show current state of embedded QDrant.
 */
async function cmdStatus() {
  const url = process.env.QDRANT_URL || 'http://localhost:6333';
  const externalHealthy = await isExternalQdrantHealthy();
  const embeddedRunning = isEmbeddedRunning();

  console.log('📊 QDrant Status');
  console.log('─'.repeat(40));

  if (externalHealthy) {
    console.log(`✅ External QDrant: running at ${url}`);
  } else if (embeddedRunning) {
    const pidFile = path.join(process.cwd(), '.gsd', 'bin', 'qdrant', '.pid');
    const pid = fs.existsSync(pidFile) ? fs.readFileSync(pidFile, 'utf8').trim() : '?';
    console.log(`✅ Embedded QDrant: running (PID: ${pid}) at ${url}`);
  } else {
    console.log('❌ No QDrant server running.');
    console.log('   Run `npm run start-qdrant` to start embedded mode.');
  }

  // Show binary info
  const binaryPath = await detectBinary();
  if (binaryPath) {
    console.log(`📦 Binary: ${binaryPath}`);
  } else {
    console.log('📦 Binary: not installed');
  }

  // Show storage
  const storageDir = process.env.QDRANT_EMBEDDED_DIR || path.join(process.cwd(), '.qdrant-data');
  if (fs.existsSync(storageDir)) {
    const size = getDirSize(storageDir);
    console.log(`💾 Storage: ${storageDir} (${size})`);
  } else {
    console.log(`💾 Storage: not initialized (${storageDir})`);
  }
}

/**
 * Calculate total directory size.
 */
function getDirSize(dirPath) {
  let total = 0;
  try {
    const walk = (p) => {
      const stat = fs.lstatSync(p);
      if (stat.isFile()) total += stat.size;
      else if (stat.isDirectory()) {
        for (const child of fs.readdirSync(p)) walk(path.join(p, child));
      }
    };
    walk(dirPath);
  } catch {
    return 'N/A';
  }

  if (total < 1024) return total + ' B';
  if (total < 1024 * 1024) return (total / 1024).toFixed(1) + ' KB';
  return (total / (1024 * 1024)).toFixed(1) + ' MB';
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'start':
      await cmdStart();
      break;
    case 'stop':
      await cmdStop();
      break;
    case 'sync':
      await cmdSync();
      break;
    case 'status':
      await cmdStatus();
      break;
    case '--help':
    case '-h':
    case 'help':
    default:
      console.log(`QDrant Embedded CLI

Usage:
  node scripts/qdrant-cli.js start   Avvia l'embedded QDrant
  node scripts/qdrant-cli.js stop    Ferma l'embedded QDrant
  node scripts/qdrant-cli.js sync    Avvia QDrant → esegui sync → lascia in background
  node scripts/qdrant-cli.js status  Mostra lo stato dell'embedded QDrant

Environment variables:
  QDRANT_EMBEDDED_DIR   Directory di storage (default: .qdrant-data/)
  QDRANT_EMBEDDED_PORT  Porta HTTP (default: 6333)
  QDRANT_URL            URL del server QDrant esterno

Differenze rispetto alla modalità Docker:
  - Nessun Docker richiesto — il binary viene scaricato automaticamente
  - Storage locale in .qdrant-data/
  - Dashboard accessibile a http://localhost:6333/dashboard
  - Comandi npm: npm run start-qdrant, npm run stop-qdrant, npm run sync`);
      break;
  }
}

main().catch((err) => {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});
