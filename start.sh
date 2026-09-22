#!/usr/bin/env bash
# Start Smartare Mat: one Node server on :8080, straight to the network.
set -euo pipefail
cd "$(dirname "$0")"

PORT=${PORT:-8080}

command -v node >/dev/null || { echo "node is not installed."; exit 1; }

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node 22.5 or newer is required (found $(node -v)); node:sqlite is built in from there."
  exit 1
fi

# Express, compression and sharp. Installed exactly as package-lock.json says,
# again whenever the lockfile is newer than what is installed.
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "  Installing packages..."
  npm ci --no-audit --no-fund
fi

mkdir -p data/outbox www/media

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  SLUG=$(basename "$PWD" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-')
  if launchctl print "gui/$(id -u)/local.${SLUG}.node" >/dev/null 2>&1; then
    echo "  Port ${PORT} is held by the autostart agent, which is already"
    echo "  serving the site. Use ./scripts/autostart.sh restart to bounce it,"
    echo "  or ./scripts/autostart.sh uninstall to go back to starting by hand."
  else
    echo "  Port ${PORT} is already in use. Run ./stop.sh first."
  fi
  exit 1
fi

echo "  Starting Node..."
echo
exec node src/server.js
