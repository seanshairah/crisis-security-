#!/bin/zsh
cd -- "$(dirname -- "$0")"
printf 'Crisis Security — open http://localhost:3139/setup\nKeep this window open while using the app. Press Control-C to stop Crisis.\n'
if curl -fsS http://localhost:3139/api/health -o /dev/null; then
  printf 'Crisis is already running. Open the address above.\n'
  exit 0
fi
npm run local:start
