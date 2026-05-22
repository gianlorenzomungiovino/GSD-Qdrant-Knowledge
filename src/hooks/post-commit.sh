#!/bin/sh
# Auto-sync GSD knowledge to Qdrant after each local commit.
# Uses cli.js sync subcommand (integrated in v2.3.1+).

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$PROJECT_ROOT" ] && exit 0
cd "$PROJECT_ROOT" || exit 0

# Risolve il percorso del CLI nel pacchetto npm installato
CLI_PATH=""
for candidate in \
  "node_modules/gsd-qdrant-knowledge/src/cli.js" \
  "$(npm root -g)/gsd-qdrant-knowledge/src/cli.js"
do
  if [ -f "$candidate" ]; then
    CLI_PATH="$candidate"
    break
  fi
done

[ -z "$CLI_PATH" ] && exit 0

# Controlla se Qdrant è raggiungibile
if ! curl -sf http://localhost:6333/ > /dev/null 2>&1; then
  exit 0
fi

node "$CLI_PATH" sync >/dev/null 2>&1 || exit 0
