# Auto-sync GSD knowledge to Qdrant after each commit.
# Windows PowerShell - uses cli.js sync subcommand (v2.3.1+)

$PROJECT_ROOT = git rev-parse --show-toplevel 2>$null
if (-not $PROJECT_ROOT) { exit 0 }
Set-Location $PROJECT_ROOT

# Auto-sync ad ogni commit locale — nessun filtro

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

# Controlla se Qdrant è raggiungibile (endpoint /health, timeout 2s)
try {
    Invoke-WebRequest -Uri "http://localhost:6333/health" -TimeoutSec 2 -UseBasicParsing | Out-Null
} catch {
    exit 0
}

# Esegue il sync in background per non bloccare il commit
Start-Process -FilePath "node" -ArgumentList "$CLI_PATH", "sync" -WindowStyle Hidden -Wait:$false
