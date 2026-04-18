@echo off
REM Auto-sync GSD knowledge to Qdrant after each local commit.
REM Risolve dinamicamente il path del sync script nel package npm installato.

for /f "delims=" %%i in ('git rev-parse --show-toplevel 2^>nul') do set PROJECT_ROOT=%%i
if "%PROJECT_ROOT%"=="" exit /b 0
cd /d "%PROJECT_ROOT%" || exit /b 1

REM Cerca il sync script nel package npm installato
set SYNC_SCRIPT=""
if exist "node_modules\gsd-qdrant-knowledge\src\sync-knowledge.js" (
  set SYNC_SCRIPT=node_modules\gsd-qdrant-knowledge\src\sync-knowledge.js
) else (
  for /f "delims=" %%r in ('npm root -g 2^>nul') do (
    if exist "%%r\gsd-qdrant-knowledge\src\sync-knowledge.js" (
      set SYNC_SCRIPT=%%r\gsd-qdrant-knowledge\src\sync-knowledge.js
      goto :found
    )
  )
)
:found
if "%SYNC_SCRIPT%"=="" exit /b 0

REM Controlla se Qdrant è raggiungibile (timeout 1s, silent)
curl -sf --connect-timeout 1 http://localhost:6333/ >nul 2>&1 || exit /b 0

node "%SYNC_SCRIPT%" >nul 2>&1 || exit /b 0
