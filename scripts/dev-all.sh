#!/usr/bin/env bash
# Start the whole backend locally with prefixed logs: API (in-memory Mongo) + vision + admin.
# Ctrl-C stops everything.  Usage: bash scripts/dev-all.sh [--no-admin]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WITH_ADMIN=1
[[ "${1:-}" == "--no-admin" ]] && WITH_ADMIN=0

PIDS=()
cleanup() {
  echo
  echo "[dev] stopping …"
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

start() { # start <label> <command…>
  local label="$1"; shift
  ( "$@" 2>&1 | sed -u "s/^/[$label] /" ) &
  PIDS+=($!)
}

# vision — mock unless the weights are there (dev-vision.sh prints which mode it picked)
start vision env PORT="${VISION_PORT:-8100}" bash scripts/dev-vision.sh

# api — in-memory MongoDB so no local mongod is required
start api env MONGO_MEMORY=1 \
  JWT_SECRET="${JWT_SECRET:-dev-secret-dev-secret-dev-secret}" \
  VISION_URL="http://127.0.0.1:${VISION_PORT:-8100}" \
  VISION_MOCK=0 \
  pnpm --filter @fitfloow/api dev

if [[ "$WITH_ADMIN" == "1" ]]; then
  start admin pnpm --filter @fitfloow/admin dev
fi

echo "[dev] vision  http://127.0.0.1:${VISION_PORT:-8100}/health"
echo "[dev] api     http://127.0.0.1:4000/api/v1"
[[ "$WITH_ADMIN" == "1" ]] && echo "[dev] admin   http://127.0.0.1:3000"
echo "[dev] Ctrl-C to stop"
wait
