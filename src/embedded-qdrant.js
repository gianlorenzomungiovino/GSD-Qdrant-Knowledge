'use strict';

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const VERSION = 'v1.13.6';
const DEFAULT_STORAGE_DIR = path.join(process.cwd(), '.qdrant-data');
const DEFAULT_PORT = 6333;
const DEFAULT_READY_TIMEOUT = 30_000; // ms
const DEFAULT_POLL_INTERVAL = 500; // ms
const DEFAULT_SHUTDOWN_TIMEOUT = 10_000; // ms
const BIN_DIR = path.join(process.cwd(), '.gsd', 'bin', 'qdrant');

// ─── Platform detection ────────────────────────────────────────────────

/**
 * Detect the platform and architecture to determine the correct binary.
 * @returns {{ name: string, platform: string, arch: string }}
 */
function detectPlatform() {
  const platform = os.platform(); // 'linux', 'darwin', 'win32'
  const arch = os.arch(); // 'x64', 'arm64', etc.

  let name;
  if (platform === 'linux') {
    if (arch === 'arm64') {
      name = 'qdrant-static-aarch64-linux';
    } else {
      name = 'qdrant-static-x86_64-linux';
    }
  } else if (platform === 'darwin') {
    if (arch === 'arm64') {
      name = 'qdrant-static-aarch64-apple-darwin';
    } else {
      name = 'qdrant-static-x86_64-apple-darwin';
    }
  } else if (platform === 'win32') {
    name = 'qdrant-windows-x86_64';
  } else {
    throw new Error(`Unsupported platform: ${platform} (${arch})`);
  }

  return { name, platform, arch };
}

/**
 * Get the binary filename for the current platform.
 * @returns {string}
 */
function getBinaryName() {
  const { platform } = detectPlatform();
  return platform === 'win32' ? 'qdrant.exe' : 'qdrant';
}

// ─── Binary detection ──────────────────────────────────────────────────

/**
 * Check if a qdrant binary exists and is executable.
 * @param {string} binPath - Full path to the binary
 * @returns {boolean}
 */
function isBinaryAvailable(binPath) {
  try {
    const stat = fs.statSync(binPath);
    if (!stat.isFile()) return false;
    // On Windows, any file is "executable"
    if (os.platform() === 'win32') return true;
    return fs.accessSync(binPath, fs.constants.X_OK);
  } catch {
    return false;
  }
}

/**
 * Detect the qdrant binary location. Checks multiple locations in priority order:
 * 1. Local `.gsd/bin/qdrant` (installed by this module)
 * 2. `qdrant` in PATH (via `which`)
 * 3. System paths: `/usr/local/bin/qdrant`, `/opt/homebrew/bin/qdrant`
 * 4. Homebrew cellar path: `/opt/homebrew/Cellar/qdrant/<version>/bin/qdrant`
 * 5. npm global bin directory
 *
 * @returns {string|null} Path to the binary, or null if not found
 */
async function detectBinary() {
  // 1. Local install
  const localBin = path.join(BIN_DIR, getBinaryName());
  if (isBinaryAvailable(localBin)) {
    return localBin;
  }

  // 2. PATH lookup
  try {
    const qdrantInPath = await which('qdrant');
    if (qdrantInPath && isBinaryAvailable(qdrantInPath)) {
      return qdrantInPath;
    }
  } catch {
    // `which` not available or failed — continue
  }

  // 3. Known system paths
  const systemPaths = [
    '/usr/local/bin/qdrant',
    '/opt/homebrew/bin/qdrant',
  ];

  for (const p of systemPaths) {
    if (isBinaryAvailable(p)) return p;
  }

  // 4. Homebrew cellar (find latest version directory)
  try {
    const cellarDir = '/opt/homebrew/Cellar/qdrant';
    if (fs.existsSync(cellarDir)) {
      const versions = fs.readdirSync(cellarDir).sort().reverse();
      if (versions.length > 0) {
        const latest = path.join(cellarDir, versions[0], 'bin', 'qdrant');
        if (isBinaryAvailable(latest)) return latest;
      }
    }
  } catch {
    // Ignore errors
  }

  // 5. npm global bin directory
  try {
    const npmGlobalBin = await getNpmGlobalBin();
    if (npmGlobalBin) {
      const npmBin = path.join(npmGlobalBin, 'qdrant' + (os.platform() === 'win32' ? '.exe' : ''));
      if (isBinaryAvailable(npmBin)) return npmBin;
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Run `which` command to find a binary in PATH.
 * @param {string} cmd
 * @returns {Promise<string|null>}
 */
function which(cmd) {
  return new Promise((resolve) => {
    const platform = os.platform();
    const args = platform === 'win32' ? ['/Q', '/F', cmd] : ['-v', cmd];
    const bin = platform === 'win32' ? 'where' : 'which';

    execFile(bin, args, { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(null);
      } else {
        // `which` returns the first match; `where` returns all — take first line
        const firstLine = stdout.trim().split('\n')[0].trim();
        resolve(firstLine);
      }
    });
  });
}

/**
 * Get the npm global bin directory.
 * @returns {Promise<string|null>}
 */
function getNpmGlobalBin() {
  return new Promise((resolve) => {
    execFile('npm', ['config', 'get', 'prefix'], { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(null);
      } else {
        const prefix = stdout.trim();
        resolve(path.join(prefix, 'bin'));
      }
    });
  });
}

// ─── Binary installation ──────────────────────────────────────────────

/**
 * Download and install the qdrant binary for the current platform.
 * @returns {Promise<string>} Path to the installed binary
 */
async function installBinary() {
  const { name, platform } = detectPlatform();
  const binName = getBinaryName();
  const destDir = BIN_DIR;
  const destPath = path.join(destDir, binName);

  // Check if already installed (idempotent)
  if (isBinaryAvailable(destPath)) {
    return destPath;
  }

  // Create directory
  fs.mkdirSync(destDir, { recursive: true });

  // Determine download URL
  const url = `https://github.com/qdrant/qdrant/releases/download/${VERSION}/${name}`;

  console.log(`[qdrant] Downloading ${VERSION} from ${url}`);

  // Stream the download
  await new Promise((resolve, reject) => {
    http.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirects
        http.get(res.headers.location, resolve).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode} from ${url}`));
        return;
      }

      const file = fs.createWriteStream(destPath, { mode: 0o755 });
      res.pipe(file);

      file.on('finish', () => {
        file.close();
        // Ensure executable on Unix
        if (platform !== 'win32') {
          try { fs.chmodSync(destPath, 0o755); } catch { /* best effort */ }
        }
        resolve();
      });

      res.on('error', reject);
      file.on('error', reject);
    }).on('error', reject);
  });

  console.log(`[qdrant] Installed to ${destPath}`);
  return destPath;
}

// ─── HTTP readiness check ─────────────────────────────────────────────

/**
 * Check if the Qdrant server is ready via its healthz endpoint.
 * @param {string} url - Full URL to check (e.g. http://localhost:6333/healthz)
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {number} intervalMs - Poll interval in milliseconds
 * @returns {Promise<boolean>}
 */
async function waitForReady(url, timeoutMs = DEFAULT_READY_TIMEOUT, intervalMs = DEFAULT_POLL_INTERVAL) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const ready = await httpGetJson(url);
      if (ready && ready.status === 'ok') {
        return true;
      }
    } catch {
      // Server not ready yet — continue polling
    }
    await sleep(intervalMs);
  }

  throw new Error(`Qdrant did not become ready within ${timeoutMs}ms`);
}

/**
 * Make an HTTP GET request and parse JSON response.
 * @param {string} urlString
 * @returns {Promise<object|null>} Parsed JSON or null on connection error
 */
function httpGetJson(urlString) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const req = http.get(urlString, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('HTTP timeout')); });
  });
}

/**
 * Sleep for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── EmbeddedQdrant class ─────────────────────────────────────────────

/**
 * Manages an embedded Qdrant server process.
 *
 * Usage:
 *   const q = new EmbeddedQdrant();
 *   await q.start();
 *   // use q.url, q.pid, q.storageDir
 *   await q.stop();
 */
class EmbeddedQdrant {
  /**
   * @param {object} [options]
   * @param {string} [options.storageDir] - Storage directory path (default: ./.qdrant-data/)
   * @param {number} [options.port] - Port to listen on (default: 6333)
   * @param {number} [options.readyTimeout] - Timeout for readiness check in ms (default: 30000)
   * @param {boolean} [options.autoInstall] - Auto-install binary if not found (default: true)
   * @param {boolean} [options.autoCleanup] - Register SIGINT/SIGTERM handlers (default: true)
   */
  constructor(options = {}) {
    this.storageDir = options.storageDir || process.env.QDRANT_EMBEDDED_DIR || DEFAULT_STORAGE_DIR;
    this.port = options.port || parseInt(process.env.QDRANT_EMBEDDED_PORT, 10) || DEFAULT_PORT;
    this.readyTimeout = options.readyTimeout || DEFAULT_READY_TIMEOUT;
    this.autoInstall = options.autoInstall !== false;
    this.autoCleanup = options.autoCleanup !== false;

    this.url = `http://localhost:${this.port}`;
    this._process = null;
    this._pid = null;
    this._stopped = false;
    this._cleanupRegistered = false;
  }

  /**
   * Current PID of the qdrant process, or null if not running.
   * @returns {number|null}
   */
  get pid() {
    return this._pid;
  }

  /**
   * Whether the server is currently running.
   * @returns {boolean}
   */
  get isRunning() {
    return this._process !== null && !this._process.kill(0);
  }

  /**
   * Start the embedded Qdrant server.
   * Idempotent: if already running, returns without starting a new process.
   * @returns {Promise<number>} PID of the qdrant process
   */
  async start() {
    // Idempotency: if already running, return existing PID
    if (this._process && !this._process.kill(0)) {
      // Process exists but is dead — clean up stale reference
      this._process = null;
      this._pid = null;
    }
    if (this._process) {
      return this._pid;
    }

    // Ensure storage directory exists
    fs.mkdirSync(this.storageDir, { recursive: true });

    // Detect or install binary
    let binaryPath = await detectBinary();
    if (!binaryPath) {
      if (this.autoInstall) {
        console.log('[qdrant] Binary not found — installing...');
        binaryPath = await installBinary();
      } else {
        throw new Error(
          `Qdrant binary not found. Install it manually or set autoInstall: true.\n` +
          `Searched: PATH, /usr/local/bin/qdrant, /opt/homebrew/bin/qdrant, Homebrew cellar, npm global bin`
        );
      }
    }

    // Build command arguments
    const args = [
      '--storage', this.storageDir,
      '--port', String(this.port),
    ];

    console.log(`[qdrant] Starting: ${binaryPath} ${args.join(' ')}`);

    // Spawn the process
    this._process = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    this._pid = this._process.pid;

    // Log stdout/stderr for debugging
    this._process.stdout.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (line) console.log(`[qdrant] ${line}`);
    });
    this._process.stderr.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (line) console.error(`[qdrant] ${line}`);
    });

    this._process.on('error', (err) => {
      console.error(`[qdrant] Process error: ${err.message}`);
    });

    this._process.on('exit', (code, signal) => {
      if (!this._stopped) {
        console.error(`[qdrant] Process exited unexpectedly: code=${code}, signal=${signal}`);
      }
      this._process = null;
      this._pid = null;
    });

    // Wait for readiness
    await waitForReady(this.url, this.readyTimeout);
    console.log(`[qdrant] Ready at ${this.url} (PID: ${this._pid})`);

    // Register cleanup handlers (once)
    if (this.autoCleanup && !this._cleanupRegistered) {
      process.on('SIGINT', this._handleSignal.bind(this));
      process.on('SIGTERM', this._handleSignal.bind(this));
      process.on('exit', this._handleExit.bind(this));
      this._cleanupRegistered = true;
    }

    return this._pid;
  }

  /**
   * Stop the embedded Qdrant server.
   * Sends SIGTERM, waits up to 10s, then SIGKILL if needed.
   * @returns {Promise<void>}
   */
  async stop() {
    if (this._stopped) return;
    this._stopped = true;

    if (!this._process || !this._process.pid) {
      return;
    }

    const pid = this._process.pid;
    console.log(`[qdrant] Stopping Qdrant (PID: ${pid})...`);

    try {
      // Send SIGTERM
      this._process.kill('SIGTERM');

      // Wait for graceful shutdown
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          // Force kill with SIGKILL
          try { this._process.kill('SIGKILL'); } catch { /* already dead */ }
          resolve();
        }, DEFAULT_SHUTDOWN_TIMEOUT);

        this._process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });

        // Also watch for unexpected exit
        this._process.on('error', (err) => {
          if (err.code === 'ESRCH') {
            // Process already gone
            clearTimeout(timeout);
            resolve();
          } else {
            reject(err);
          }
        });
      });
    } catch (err) {
      if (err.code !== 'ESRCH') {
        console.error(`[qdrant] Error stopping Qdrant: ${err.message}`);
      }
    }

    this._process = null;
    this._pid = null;
    console.log('[qdrant] Stopped.');
  }

  /**
   * Handle OS signals — stop the server and exit.
   * @param {number} signal
   */
  _handleSignal(signal) {
    console.log(`[qdrant] Received ${signal}, shutting down...`);
    this.stop()
      .then(() => {
        process.exit(0);
      })
      .catch((err) => {
        console.error(`[qdrant] Error during shutdown: ${err.message}`);
        process.exit(1);
      });
  }

  /**
   * Handle process exit — best-effort cleanup.
   */
  _handleExit() {
    if (this._process && this._process.pid) {
      try { this._process.kill('SIGTERM'); } catch { /* ignore */ }
    }
  }

  /**
   * Full lifecycle: start, run the callback, then stop.
   * @param {Function} fn - Async function to execute while Qdrant is running
   * @returns {Promise<void>}
   */
  async with(fn) {
    await this.start();
    try {
      await fn(this);
    } finally {
      await this.stop();
    }
  }
}

// ─── Exported module-level convenience ────────────────────────────────

/**
 * Convenience function: detect binary and return its path.
 * @returns {Promise<string|null>}
 */
async function detect() {
  return detectBinary();
}

/**
 * Convenience function: install the qdrant binary.
 * @returns {Promise<string>}
 */
async function install() {
  return installBinary();
}

module.exports = {
  EmbeddedQdrant,
  detectBinary,
  detect,
  installBinary,
  install,
  waitForReady,
  sleep,
  getBinaryName,
  detectPlatform,
  isBinaryAvailable,
};
