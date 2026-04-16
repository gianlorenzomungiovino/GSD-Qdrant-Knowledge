# Auto-sync GSD knowledge to Qdrant after each local commit.
# Compatibile con PowerShell (Windows)

$PROJECT_ROOT = git rev-parse --show-toplevel 2>$null
if (-not $PROJECT_ROOT) { exit 0 }
Set-Location $PROJECT_ROOT
node src\sync-knowledge.js 2>$null || Write-Host "[qdrant-sync] sync-knowledge failed"
