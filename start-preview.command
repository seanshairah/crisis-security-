#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "CRISIS SECURITY — no database, npm or Codex credits required"
echo "Preview: http://localhost:3004/crisis-preview/"
if command -v open >/dev/null 2>&1; then
  (sleep 2; open 'http://localhost:3004/crisis-preview/') &
fi
python3 -m http.server 3004 --directory public
