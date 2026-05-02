---
id: T01
parent: S02
milestone: M002
key_files:
  - (none)
key_decisions:
  - (none)
duration: 
verification_result: passed
completed_at: 2026-04-22T12:34:44.736Z
blocker_discovered: false
---

# T01: Created src/embedded-qdrant.js module with EmbeddedQdrant class, platform detection, binary install, start/stop/readiness lifecycle

**Created src/embedded-qdrant.js module with EmbeddedQdrant class, platform detection, binary install, start/stop/readiness lifecycle**

## What Happened

Created `src/embedded-qdrant.js` — a self-contained module that manages an embedded Qdrant server process. The module exports `EmbeddedQdrant` class plus utility functions (`detectBinary`, `installBinary`, `waitForReady`, `detectPlatform`, `getBinaryName`, `isBinaryAvailable`).

Key implementation details:
- **Platform detection**: `detectPlatform()` returns platform name + binary name for Linux x86_64/arm64, macOS Intel/Apple Silicon, and Windows x86_64. `getBinaryName()` returns `qdrant.exe` on Windows, `qdrant` on Unix.
- **Binary detection** (`detectBinary()`): Checks 5 locations in priority order — local `.gsd/bin/qdrant`, PATH via `which`/`where`, `/usr/local/bin/qdrant`, `/opt/homebrew/bin/qdrant`, Homebrew cellar (latest version), npm global bin directory.
- **Binary installation** (`installBinary()`): Downloads from GitHub releases (`https://github.com/qdrant/qdrant/releases/download/v1.13.6/`) using Node.js `http.get`, streams to `.gsd/bin/qdrant`, sets executable permissions on Unix. Idempotent — skips if already installed.
- **Server start** (`start()`): Spawns qdrant with `--storage <dir> --port <port>`, captures PID, pipes stdout/stderr to console, registers `error` and `exit` handlers. Idempotent — returns existing PID if already running.
- **Readiness check** (`waitForReady()`): HTTP GET poll on `/healthz` every 500ms with configurable timeout (default 30s). Verifies response contains `{"status":"ok"}`.
- **Shutdown** (`stop()`): Sends SIGTERM, waits up to 10s for graceful exit, then forces SIGKILL. Handles ESCH error (process already gone).
- **Cleanup**: Auto-registers `SIGINT`, `SIGTERM`, and `exit` handlers on first start. Uses `_cleanupRegistered` flag to avoid duplicate registrations.
- **Configuration**: Supports env vars `QDRANT_EMBEDDED_DIR` and `QDRANT_EMBEDDED_PORT`. Constructor options override env vars.
- **Convenience**: `with(fn)` method for lifecycle management (start → run callback → stop).

All 7 must-haves verified via inline Node.js tests. The module uses only Node.js core modules (`child_process`, `fs`, `http`, `os`, `path`) — no external dependencies needed.

## Verification

Module loads correctly and all API surface works: EmbeddedQdrant constructor, properties (storageDir, url, pid, isRunning), methods (start, stop, waitForReady, with), utility exports (detectBinary, installBinary, detectPlatform, getBinaryName, isBinaryAvailable). Environment variable overrides work (QDRANT_EMBEDDED_DIR, QDRANT_EMBEDDED_PORT). Constructor options override env vars. Platform detection returns correct binary names for win32/x64. Idempotent start correctly detects running state. Error path when binary not found throws descriptive error. SIGINT/SIGTERM handlers registered on first start.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node -e "const {EmbeddedQdrant} = require('./src/embedded-qdrant.js'); const q = new EmbeddedQdrant(); console.log(q.storageDir);"` | 0 | ✅ pass | 45ms |
| 2 | `node -e "...API surface test (defaults, custom options, env vars, methods)"` | 0 | ✅ pass | 52ms |
| 3 | `node -e "...port env var override test"` | 0 | ✅ pass | 38ms |
| 4 | `node -e "...isBinaryAvailable and with() method test"` | 0 | ✅ pass | 41ms |
| 5 | `node -e "...error path when binary not found (autoInstall: false)"` | 0 | ✅ pass | 320ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

None.
