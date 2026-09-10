#!/usr/bin/env bash
# Run the Python vision microservice (pnpm dev:vision).
#
#   VISION_MOCK=1     force deterministic mock detections (no weights needed)
#   VISION_MOCK=0     require the real weights (startup fails loudly without them)
#   unset             real model if apps/vision/models is populated, mock otherwise
#   PORT=8100         listen port     RELOAD=1  uvicorn autoreload
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VISION="$ROOT/apps/vision"
PYTHON="${PYTHON:-python3}"
PORT="${PORT:-8100}"
HOST="${HOST:-127.0.0.1}"

cd "$VISION"

if [[ ! -x ".venv/bin/python" ]]; then
  echo "[vision] creating venv (.venv) …"
  "$PYTHON" -m venv .venv
  ./.venv/bin/python -m pip install --quiet --upgrade pip
  ./.venv/bin/python -m pip install --quiet -r requirements.txt
fi

if [[ -z "${VISION_MOCK:-}" && ! -f "${MODEL_DIR:-models}/onnx/model_quantized.onnx" ]]; then
  echo "[vision] no weights in ${MODEL_DIR:-apps/vision/models} — starting in MOCK mode."
  echo "[vision] run:  apps/vision/.venv/bin/python -m app.download   (~93 MB) for the real model"
fi

echo "[vision] http://$HOST:$PORT  (health: /health, docs: /docs)"
exec ./.venv/bin/python -m uvicorn app.main:app \
  --host "$HOST" --port "$PORT" --workers 1 --log-level "${LOG_LEVEL:-info}" \
  ${RELOAD:+--reload}
