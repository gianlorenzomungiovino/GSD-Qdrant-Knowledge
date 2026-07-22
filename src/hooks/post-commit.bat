@echo off
REM Auto-sync GSD knowledge to Qdrant after each commit.
REM Uses cli.js sync subcommand (v2.3.1+).

for /f "delims=" %%i in ('git rev-parse --show-toplevel 2^>nul') do set PROJECT_ROOT=%%i
if "%PROJECT_ROOT%"=="" exit /b 0
cd /d "%PROJECT_ROOT%" || exit /b 1

REM Auto-sync ad ogni commit locale — nessun filtro

REM Cerca il CLI nel package npm installato
set CLI_PATH=""
if exist "node_modules\gsd-qdrant-knowledge\src\cli.js" (
  set CLI_PATH=node_modules\gsd-qdrant-knowledge\src\cli.js
) else (
  for /f "delims=" %%r in ('npm root -g 2^>nul') do (
    if exist "%%r\gsd-qdrant-knowledge\src\cli.js" (
      set CLI_PATH=%%r\gsd-qdrant-knowledge\src\cli.js
      goto :found
    )
  )
)
:found
if "%CLI_PATH%"=="" exit /b 0

REM Controlla se Qdrant è raggiungibile (endpoint /health, timeout 2s)
curl -sf --connect-timeout 2 http://localhost:6333/health >nul 2>&1 || exit /b 0

REM Esegue il sync in background per non bloccare il commit
start /b node "%CLI_PATH%" sync >nul 2>&1
