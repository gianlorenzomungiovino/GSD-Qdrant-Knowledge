'use strict';

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
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
 * Detect the platform and architecture to determine the correct release asset.
 * @returns {{ archiveName: string, extension: string, binaryName: string, platform: string, arch: string }}
 */
function detectPlatform() {
  const platform = os.platform(); // 'linux', 'darwin', 'win32'
  const arch = os.arch(); // 'x64', 'arm64', etc.

  let archiveName;
  if (platform === 'linux') {
    if (arch === 'arm64') {
      archiveName = 'qdrant-aarch64-unknown-linux-musl.tar.gz';
    } else {
      archiveName = 'qdrant-x86_64-unknown-linux-gnu.tar.gz';
    }
  } else if (platform === 'darwin') {
    if (arch === 'arm64') {
      archiveName = 'qdrant-aarch64-apple-darwin.tar.gz';
    } else {
      archiveName = 'qdrant-x86_64-apple-darwin.tar.gz';
    }
  } else if (platform === 'win32') {
    archiveName = 'qdrant-x86_64-pc-windows-msvc.zip';
  } else {
    throw new Error(`Unsupported platform: ${platform} (${arch})`);
  }

  return { archiveName, extension: archiveName.split('.').pop(), binaryName: getBinaryName(), platform, arch };
}

/**
 * Get the binary filename for the current platform.
 * @returns {string}
 */
function getBinaryName() {
  return os.platform() === 'win32' ? 'qdrant.exe' : 'qdrant';
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

// ─── Archive extraction ────────────────────────────────────────────────

/**
 * Extract a tar.gz archive to the destination directory.
 * @param {string} archivePath - Path to the tar.gz file
 * @param {string} destDir - Destination directory
 * @returns {Promise<void>}
 */
function extractTarGz(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const tar = spawn('tar', ['-xzf', archivePath, '-C', destDir]);

    const input = fs.createReadStream(archivePath);
    input.pipe(gunzip).pipe(tar.stdin);

    tar.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}`));
    });

    tar.stderr.on('data', (chunk) => {
      // tar stderr is noisy — only log errors
      const line = chunk.toString().trim();
      if (line && !line.includes('Cannot utime') && !line.includes('Cannot set access')) {
        console.error(`[qdrant] tar: ${line}`);
      }
    });

    input.on('error', reject);
    gunzip.on('error', reject);
  });
}

/**
 * Extract a zip archive to the destination directory.
 * Tries: unzip command → tar command → fallback error.
 * @param {string} archivePath - Path to the zip file
 * @param {string} destDir - Destination directory
 * @returns {Promise<void>}
 */
function extractZip(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    // Try 'unzip' first (Git Bash, WSL, etc.)
    execFile('unzip', ['-o', archivePath, '-d', destDir], { timeout: 30000 }, (err) => {
      if (!err) { resolve(); return; }

      // Fallback: try 'tar' (Windows 10+ built-in tar supports zip)
      execFile('tar', ['-xf', archivePath, '-C', destDir], { timeout: 30000 }, (err2) => {
        if (!err2) { resolve(); return; }

        reject(new Error(`Zip extraction failed (unzip: ${err.message}, tar: ${err2.message})`));
      });
    });
  });
}

// ─── Binary installation ──────────────────────────────────────────────

/**
 * Download and install the qdrant binary for the current platform.
 * Downloads an archive (tar.gz or zip), extracts it, and places the binary.
 * @returns {Promise<string>} Path to the installed binary
 */
async function installBinary() {
  const { archiveName, extension, binaryName } = detectPlatform();
  const destDir = BIN_DIR;
  const destPath = path.join(destDir, binaryName);

  // Check if already installed (idempotent)
  if (isBinaryAvailable(destPath)) {
    return destPath;
  }

  // Create directory
  fs.mkdirSync(destDir, { recursive: true });

  // Determine download URL
  const url = `https://github.com/qdrant/qdrant/releases/download/${VERSION}/${archiveName}`;
  console.log(`[qdrant] Downloading ${VERSION} from ${url}`);

  // Download the archive to a temp file
  const tmpArchive = path.join(destDir, `${archiveName}.tmp`);
  await downloadFile(url, tmpArchive);

  // Extract the archive
  console.log(`[qdrant] Extracting ${archiveName}...`);
  if (extension === 'tar.gz') {
    await extractTarGz(tmpArchive, destDir);
  } else if (extension === 'zip') {
    await extractZip(tmpArchive, destDir);
  } else {
    throw new Error(`Unknown archive extension: ${extension}`);
  }

  // Clean up temp file
  try { fs.unlinkSync(tmpArchive); } catch {}

  // On Unix, ensure the binary is executable
  if (os.platform() !== 'win32') {
    try { fs.chmodSync(destPath, 0o755); } catch { /* best effort */ }
  }

  console.log(`[qdrant] Installed to ${destPath}`);
  return destPath;
}

/**
 * Download a file from a URL and write it to disk.
 * Follows redirects automatically.
 * @param {string} url - Download URL (http or https)
 * @param {string} destPath - Output file path
 * @returns {Promise<void>}
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;

    const req = mod.get(url, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
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
        resolve();
      });

      res.on('error', reject);
      file.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(60_000, () => { req.destroy(); reject(new Error('Download timeout (60s)')); });
  });
}

// ─── HTTP readiness check ─────────────────────────────────────────────

/**
 * Check if the Qdrant server is ready via its healthz endpoint.
 * Qdrant v1.x returns plain text "healthz check passed" on /healthz.
 * @param {string} baseUrl - Base URL (e.g. http://localhost:6333)
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {number} intervalMs - Poll interval in milliseconds
 * @returns {Promise<void>}
 */
async function waitForReady(baseUrl, timeoutMs = DEFAULT_READY_TIMEOUT, intervalMs = DEFAULT_POLL_INTERVAL) {
  const healthUrl = `${baseUrl}/healthz`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const body = await httpGetText(healthUrl);
      if (body && (body.includes('ok') || body.includes('passed'))) {
        return; // ready
      }
    } catch {
      // Server not ready yet — continue polling
    }
    await sleep(intervalMs);
  }

  throw new Error(`Qdrant did not become ready within ${timeoutMs}ms`);
}

/**
 * Make an HTTP GET request and return plain text response.
 * @param {string} urlString
 * @returns {Promise<string>} Response body text or empty string on error
 */
function httpGetText(urlString) {
  return new Promise((resolve, reject) => {
    const req = http.get(urlString, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve(body);
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('HTTP timeout')); });
  });
}

/**
 * Make an HTTP GET request and parse JSON response.
 * @param {string} urlString
 * @returns {Promise<object|null>} Parsed JSON or null on connection error
 */
function httpGetJson(urlString) {
  return new Promise((resolve, reject) => {
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
 * Normalize a path for use in YAML config files.
 * On Windows, backslashes are YAML escape triggers — convert to forward slashes.
 * @param {string} p
 * @returns {string}
 */
function yamlSafePath(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Write a minimal Qdrant config file for embedded mode.
 * @param {string} storageDir - Storage directory path
 * @param {number} port - HTTP port to listen on
 * @param {string} configPath - Path to write the config file
 */
function writeConfig(storageDir, port, configPath) {
  const snapshotsPath = yamlSafePath(path.join(storageDir, 'snapshots'));
  const tmpPath = yamlSafePath(path.join(storageDir, 'tmp'));
  const content = `storage:
  storage_path: ${yamlSafePath(storageDir)}
  snapshots_path: ${snapshotsPath}
  temp_path: ${tmpPath}
service:
  disable_telemetry: true
  http_port: ${port}
`;
  fs.writeFileSync(configPath, content, 'utf8');
}

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

    // Create a minimal config file for embedded mode
    const configDir = path.join(process.cwd(), '.gsd', 'bin', 'qdrant');
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.yaml');
    writeConfig(this.storageDir, this.port, configPath);

    // Build command arguments (new qdrant uses --config-path only; port is in config)
    const args = [
      '--config-path', configPath,
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
