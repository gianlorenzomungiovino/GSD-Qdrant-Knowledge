# Auto-sync GSD knowledge to Qdrant after each local commit.
# Windows PowerShell - path dinamico per npm install

$PROJECT_ROOT = git rev-parse --show-toplevel 2>$null
if (-not $PROJECT_ROOT) { exit 0 }
Set-Location $PROJECT_ROOT

# Cerca il sync script nel package npm installato
$SYNC_SCRIPT = $null
if (Test-Path "node_modules\gsd-qdrant-knowledge\src\sync-knowledge.js") {
    $SYNC_SCRIPT = "node_modules\gsd-qdrant-knowledge\src\sync-knowledge.js"
} else {
    $GLOBAL_NODE_MODULES = npm root -g 2>$null
    if ($GLOBAL_NODE_MODULES) {
        $candidate = Join-Path $GLOBAL_NODE_MODULES "gsd-qdrant-knowledge\src\sync-knowledge.js"
        if (Test-Path $candidate) {
            $SYNC_SCRIPT = $candidate
        }
    }
}

if (-not $SYNC_SCRIPT) { exit 0 }

# Controlla se Qdrant è raggiungibile (timeout 1s, silent)
try {
    Invoke-WebRequest -Uri "http://localhost:6333/" -TimeoutSec 1 -UseBasicParsing | Out-Null
} catch {
    exit 0
}

node $SYNC_SCRIPT 2>$null || exit 0
