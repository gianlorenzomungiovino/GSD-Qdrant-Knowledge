#!/bin/sh
# Auto-sync GSD knowledge to Qdrant after each local commit.
# Compatibile con Linux/Mac e Windows (Git Bash)

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$PROJECT_ROOT" ] && exit 0
cd "$PROJECT_ROOT" || exit 0
node scripts/sync-knowledge.js >/dev/null 2>&1 || echo "[qdrant-sync] sync-knowledge failed" >&2
