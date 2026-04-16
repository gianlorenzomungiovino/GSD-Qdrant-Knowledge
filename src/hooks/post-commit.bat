@echo off
REM Auto-sync GSD knowledge to Qdrant after each local commit.
REM Compatibile con Windows (cmd.exe)

for /f "delims=" %%i in ('git rev-parse --show-toplevel 2^>nul') do set PROJECT_ROOT=%%i
if "%PROJECT_ROOT%"=="" exit /b 0
cd /d "%PROJECT_ROOT%" || exit /b 1
node src\sync-knowledge.js >nul 2>&1 || echo [qdrant-sync] sync-knowledge failed
