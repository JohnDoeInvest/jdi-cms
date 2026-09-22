#!/usr/bin/env bash
# Stop the Node server started from this project.
cd "$(dirname "$0")"

# The launchd agent restarts it within seconds, so stopping by hand while it
# is loaded looks like nothing happened. Say so rather than let it puzzle
# someone.
SLUG=$(basename "$PWD" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-')
if launchctl print "gui/$(id -u)/local.${SLUG}.node" >/dev/null 2>&1; then
  echo "  The autostart agent is loaded — it will restart this within ~10s."
  echo "  To stop for good:  ./scripts/autostart.sh uninstall"
  echo
fi

if pkill -f "node src/server.js" 2>/dev/null; then
  echo "  Node server stopped."
else
  echo "  Node server was not running."
fi
