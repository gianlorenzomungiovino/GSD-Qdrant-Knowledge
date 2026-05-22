# Auto-sync GSD knowledge to Qdrant after each commit.
# Windows PowerShell - uses cli.js sync subcommand (v2.3.1+)

$PROJECT_ROOT = git rev-parse --show-toplevel 2>$null
if (-not $PROJECT_ROOT) { exit 0 }
Set-Location $PROJECT_ROOT

# Cerca il CLI nel package npm installato
$CLI_PATH = $null
if (Test-Path "node_modules\gsd-qdrant-knowledge\src\cli.js") {
    $CLI_PATH = "node_modules\gsd-qdrant-knowledge\src\cli.js"
} else {
    $GLOBAL_NODE_MODULES = npm root -g 2>$null
    if ($GLOBAL_NODE_MODULES) {
        $candidate = Join-Path $GLOBAL_NODE_MODULES "gsd-qdrant-knowledge\src\cli.js"
        if (Test-Path $candidate) {
            $CLI_PATH = $candidate
        }
    }
}

if (-not $CLI_PATH) { exit 0 }

# Controlla se Qdrant è raggiungibile (timeout 1s, silent)
try {
    Invoke-WebRequest -Uri "http://localhost:6333/" -TimeoutSec 1 -UseBasicParsing | Out-Null
} catch {
    exit 0
}

node $CLI_PATH sync 2>$null || exit 0
