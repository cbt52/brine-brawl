#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f server/index.ts ]; then
  echo "serve: no server yet"
  exit 0
fi
