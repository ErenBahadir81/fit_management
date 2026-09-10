#!/usr/bin/env bash
# Vision service tests (pnpm test:vision). Creates the venv on first run.
#
#   RUN_MODEL_TESTS=1   also run the tests that need the real ONNX weights
#   extra args are passed straight to pytest:  pnpm test:vision -- -k imaging -v
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VISION="$ROOT/apps/vision"
PYTHON="${PYTHON:-python3}"

cd "$VISION"

if [[ ! -x ".venv/bin/python" ]]; then
  echo "[vision] creating venv (.venv) …"
  "$PYTHON" -m venv .venv
  ./.venv/bin/python -m pip install --quiet --upgrade pip
fi

# Cheap freshness check: reinstall only when requirements.txt is newer than the stamp.
STAMP=".venv/.requirements.sha256"
CURRENT="$(sha256sum requirements.txt | cut -d' ' -f1)"
if [[ ! -f "$STAMP" || "$(cat "$STAMP")" != "$CURRENT" ]]; then
  echo "[vision] installing requirements.txt …"
  ./.venv/bin/python -m pip install --quiet -r requirements.txt
  echo "$CURRENT" > "$STAMP"
fi

exec ./.venv/bin/python -m pytest "$@"
