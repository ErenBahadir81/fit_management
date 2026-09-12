#!/usr/bin/env bash
# Boots the API (in-memory Mongo, mock vision), the admin production build and the mobile web
# export, runs the browser checks against them, then tears everything down.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
API_PORT=${API_PORT:-4000}
ADMIN_PORT=${ADMIN_PORT:-3000}
MOBILE_PORT=${MOBILE_PORT:-8082}
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

wait_for() { for _ in $(seq 1 "${3:-90}"); do curl -sf -o /dev/null "$1" && return 0; sleep 1; done; echo "timeout waiting for $2"; return 1; }

echo "▶ API"
( cd apps/api && MONGO_MEMORY=1 JWT_SECRET=e2e-secret-e2e-secret-e2e-secret PORT=$API_PORT VISION_MOCK=1 \
    LOG_LEVEL=warn NODE_ENV=development CORS_ORIGINS='*' npx tsx src/server.ts > /tmp/e2e-api.log 2>&1 ) &
PIDS+=($!)
wait_for "http://127.0.0.1:$API_PORT/api/v1/health" "api" 120 || exit 1

echo "▶ admin build"
( cd apps/admin && API_URL=http://127.0.0.1:$API_PORT npx next build > /tmp/e2e-admin-build.log 2>&1 ) || { tail -20 /tmp/e2e-admin-build.log; exit 1; }
( cd apps/admin && API_URL=http://127.0.0.1:$API_PORT npx next start -p $ADMIN_PORT > /tmp/e2e-admin.log 2>&1 ) &
PIDS+=($!)
wait_for "http://127.0.0.1:$ADMIN_PORT/login" "admin" 90 || exit 1

echo "▶ mobile web export"
( cd apps/mobile && EXPO_PUBLIC_API_URL="http://127.0.0.1:$API_PORT/api/v1" npx expo export --platform web --output-dir dist-web --clear > /tmp/e2e-mobile-build.log 2>&1 ) || { tail -20 /tmp/e2e-mobile-build.log; exit 1; }
( cd apps/mobile/dist-web && npx http-server -p $MOBILE_PORT -s --cors -P "http://127.0.0.1:$MOBILE_PORT?" . > /tmp/e2e-mobile.log 2>&1 ) &
PIDS+=($!)
wait_for "http://127.0.0.1:$MOBILE_PORT/" "mobile web" 60 || exit 1

status=0
export MOBILE_URL="http://127.0.0.1:$MOBILE_PORT"
export ADMIN_URL="http://127.0.0.1:$ADMIN_PORT"
export API_URL="http://127.0.0.1:$API_PORT/api/v1"
for spec in mobile mobile-training mobile-nutrition mobile-body admin admin-flows; do
  echo "▶ $spec"
  node "$ROOT/e2e/$spec.e2e.mjs" || status=1
done
exit $status
