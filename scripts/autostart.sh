#!/usr/bin/env bash
#
# Keep the server running across logins, via a launchd user agent that
# supervises Node and restarts it on crash.
#
#   ./scripts/autostart.sh install     write the agent and start it now
#   ./scripts/autostart.sh status      what is loaded and listening
#   ./scripts/autostart.sh restart     bounce it
#   ./scripts/autostart.sh uninstall   stop it and remove the agent
#
# This is a *user* agent in ~/Library/LaunchAgents, so it needs no root and
# starts when this user logs in. A machine sitting at the login screen after a
# reboot runs nothing - see README for why a LaunchDaemon is the alternative.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

# Label from the directory name, so a copy of this project elsewhere gets its
# own agent instead of fighting over this one.
SLUG=$(basename "$ROOT" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-')
LABEL_APP="local.${SLUG}.node"
AGENTS="$HOME/Library/LaunchAgents"
PLIST_APP="$AGENTS/${LABEL_APP}.plist"
DOMAIN="gui/$(id -u)"
PORT=${PORT:-8080}

NODE_BIN=$(command -v node || true)

# launchd hands agents a bare PATH of /usr/bin:/bin:/usr/sbin:/sbin, which
# Homebrew is not on. Carry the directory node lives in, for anything that
# looks for it by name.
tool_paths() {
  echo "$(dirname "$NODE_BIN"):/usr/bin:/bin:/usr/sbin:/sbin"
}

write_plist() {                       # label, out, program-arguments-xml
  cat > "$2" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key>
  <array>
$3
  </array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(tool_paths)</string>
  </dict>
  <key>StandardOutPath</key><string>${ROOT}/data/logs/$1.out.log</string>
  <key>StandardErrorPath</key><string>${ROOT}/data/logs/$1.err.log</string>
</dict>
</plist>
PLIST
}

# bootout returns before launchd has finished with the old job, and a
# bootstrap into that gap fails with "Input/output error" - leaving nothing
# running and the site down (2026-09-21). So wait for the old job to be gone,
# and give the bootstrap a second chance.
load_agent() {
  launchctl bootout "$DOMAIN/$1" 2>/dev/null || true
  for _ in $(seq 1 40); do
    launchctl print "$DOMAIN/$1" >/dev/null 2>&1 || break
    sleep 0.25
  done
  launchctl bootstrap "$DOMAIN" "$2" 2>/dev/null \
    || { sleep 2; launchctl bootstrap "$DOMAIN" "$2"; }
}
unload_agent() { launchctl bootout "$DOMAIN/$1" 2>/dev/null || true; }

case "${1:-}" in
install)
  [ -n "$NODE_BIN" ] || { echo "node is not installed."; exit 1; }

  mkdir -p "$AGENTS" data/logs data/outbox www/media

  # The agent runs node directly, so the packages have to be in place first.
  if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    npm ci --no-audit --no-fund
  fi

  # Anything started by hand would hold the port the agent needs.
  ./stop.sh >/dev/null 2>&1 || true

  write_plist "$LABEL_APP" "$PLIST_APP" "    <string>${NODE_BIN}</string>
    <string>${ROOT}/src/server.js</string>"

  load_agent "$LABEL_APP" "$PLIST_APP"

  echo "  Installed and started:"
  echo "    $PLIST_APP"
  echo
  echo "  It starts again whenever you log in. Logs: data/logs/"
  echo "  Stop it with: ./scripts/autostart.sh uninstall"
  ;;

uninstall)
  unload_agent "$LABEL_APP"
  rm -f "$PLIST_APP"
  echo "  Agent stopped and removed. ./start.sh still works by hand."
  ;;

restart)
  launchctl kickstart -k "$DOMAIN/$LABEL_APP" 2>/dev/null || echo "  node agent is not loaded."
  echo "  Restarted."
  ;;

status|'')
  if launchctl print "$DOMAIN/$LABEL_APP" >/dev/null 2>&1; then
    pid=$(launchctl print "$DOMAIN/$LABEL_APP" 2>/dev/null | awk '/^\tpid = /{print $3}')
    echo "  $LABEL_APP  loaded${pid:+, pid $pid}"
  else
    echo "  $LABEL_APP  not loaded"
  fi
  echo
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "  port $PORT  listening"
  else
    echo "  port $PORT  nothing listening"
  fi
  ;;

*)
  echo "usage: $0 {install|uninstall|restart|status}"; exit 1 ;;
esac
