#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f server/index.ts ]; then
  echo "serve: no server yet"
  exit 0
fi
mkdir -p .loop dist
PIDFILE=.loop/server.pid

# mkdir lock so parallel runs don't collide; drop stale locks (>5 min)
LOCK=.loop/serve.lock
if [ -d "$LOCK" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +5 2>/dev/null)" ]; then
  rmdir "$LOCK" 2>/dev/null || true
fi
for _ in $(seq 1 120); do
  mkdir "$LOCK" 2>/dev/null && break
  sleep 1
done
[ -d "$LOCK" ] || { echo "serve: lock timeout"; exit 3; }
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

# build into a side directory; keep the old server if it fails
if ! OUT_DIR=dist/client.new npm run build >> .loop/build.log 2>&1; then
  echo "serve: build failed (see .loop/build.log)"
  exit 1
fi

# stop the old server only via our pidfile
if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE")
  if kill -0 "$OLD" 2>/dev/null; then
    kill -TERM "$OLD" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$OLD" 2>/dev/null || break
      sleep 0.5
    done
    kill -0 "$OLD" 2>/dev/null && kill -KILL "$OLD" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
fi

if lsof -ti tcp:8720 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "serve: port busy by foreign process"
  exit 2
fi

# swap build directories
[ -d dist/client.old ] && rm -r dist/client.old || true
[ -d dist/client ] && mv dist/client dist/client.old
mv dist/client.new dist/client

nohup env PORT=8720 HOST=0.0.0.0 CLIENT_DIR=dist/client node --import tsx server/index.ts >> .loop/server.log 2>&1 &
echo $! > "$PIDFILE"
disown

for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8720/healthz >/dev/null 2>&1; then
    echo "serve: up"
    echo "Tailscale: http://talhas-macbook-pro.tail185886.ts.net:8720"
    echo "LAN:       http://192.168.178.60:8720"
    exit 0
  fi
  sleep 0.5
done
echo "serve: server did not become healthy (see .loop/server.log)"
exit 1
