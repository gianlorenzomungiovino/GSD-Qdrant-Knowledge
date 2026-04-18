#!/bin/sh
# Auto-sync GSD knowledge to Qdrant after each local commit.
# Risolve dinamicamente il path del sync script nel package npm installato.

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$PROJECT_ROOT" ] && exit 0
cd "$PROJECT_ROOT" || exit 0

# Risolve il percorso del sync script nel pacchetto npm installato
SYNC_SCRIPT=""
for candidate in \
  "node_modules/gsd-qdrant-knowledge/src/sync-knowledge.js" \
  "$(npm root -g)/gsd-qdrant-knowledge/src/sync-knowledge.js"
do
  if [ -f "$candidate" ]; then
    SYNC_SCRIPT="$candidate"
    break
  fi
done

[ -z "$SYNC_SCRIPT" ] && exit 0

# Controlla se Qdrant è raggiungibile
if ! curl -sf http://localhost:6333/ > /dev/null 2>&1; then
  exit 0
fi

node "$SYNC_SCRIPT" >/dev/null 2>&1 || exit 0
