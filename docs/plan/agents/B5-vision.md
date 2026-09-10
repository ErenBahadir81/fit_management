# B5 — Vision microservice (Python) + dev/test scripts + containerization

Model: Opus (high effort). Read `COMMON.md` first. Plan docs: `05-nutrition-vision.md` (§Vision microservice — the contract),
research `docs/research/food-recognition.md` (all sections; decisions in §6–7). The Node client that calls you is
`apps/api/src/modules/vision/client.ts` — match its request/response shape exactly.

## You own
- `apps/vision/**` (FastAPI app, tests, requirements, README, Dockerfile)
- `scripts/dev-vision.sh`, `scripts/test-vision.sh`, `scripts/dev-all.sh`, `docker-compose.yml` (mongo + api + vision + admin), `apps/api/Dockerfile`, `apps/admin/Dockerfile`
- `apps/api/test/vision-contract.test.ts` (Node ↔ Python contract test that runs only when `VISION_URL` points at a live service, otherwise `it.skip`)

## Deliverables (tests first; pytest)
1. `apps/vision/app/`: `main.py` (FastAPI: `GET /health`, `POST /v1/analyze` multipart `image`), `settings.py` (env: `VISION_MOCK`, `MODEL_DIR`,
   `MODEL_ID=onnx-community/swin-finetuned-food101-ONNX`, `MODEL_FILE=onnx/model_quantized.onnx`, `CLIP_ENABLED`, `TURKISH_HEAD=0`,
   `TOP_K=3`, `MIN_CONFIDENCE=0.15`, `INTRA_OP_THREADS=4`, `MAX_UPLOAD_MB=6`), `predictor.py` (`Predictor` protocol: `MockPredictor`
   (sha256-deterministic over the label list, same algorithm as the Node `mockAnalysis`), `OnnxFood101Predictor` (onnxruntime session, preprocessing
   from the model's `preprocessor_config.json` — resize 224, normalize ImageNet mean/std, NCHW float32; softmax; top-k), optional `ClipGate`
   (onnx CLIP: "a photo of food" vs non-food prompts; returns `gate: "notFood"` when non-food prob > 0.6; skipped if weights missing → `gate: "off"`)),
   `labels.py` (Food-101 id2label + Turkish names dict; TurkishFoods-25 labels), `download.py` (`python -m app.download` fetches model files with
   `urllib` following redirects from `https://huggingface.co/<repo>/resolve/main/<file>` into `MODEL_DIR`, prints sizes, idempotent), `imaging.py`
   (validate content type, decode with Pillow, EXIF-transpose, downscale, reject > MAX_UPLOAD_MB).
   Response JSON: `{ detections: [{label, confidence, bbox: null}], modelVersion, mock, latencyMs, imageSize: [w, h], gate }`.
   Health JSON: `{ ok, mock, modelLoaded, modelVersion }`. Load the model eagerly at startup (lifespan); fall back to mock with a loud log line if
   the model dir is missing and `VISION_MOCK` is unset (`mock: true` visible in every response). Single uvicorn worker, ORT intra-op threads = 4,
   an `asyncio.Semaphore(2)` around inference; overflow → 429.
2. `requirements.txt` (fastapi, uvicorn[standard], python-multipart, pillow, numpy, onnxruntime, pytest, httpx) and `requirements-export.txt`
   (torch CPU index, transformers, optimum — only for an optional `scripts/export_onnx.py`). Create a venv at `apps/vision/.venv` and install
   `requirements.txt` (pip works here; onnxruntime is ~40 MB). Actually download the primary model (~93 MB) into `apps/vision/models/` and run
   one real inference in a test guarded by `RUN_MODEL_TESTS=1` (set it when the model is present) — report the measured latency in your Status.
   `apps/vision/models/` is git-ignored.
3. Tests (`apps/vision/tests/`): mock mode end-to-end via `httpx.AsyncClient`/`TestClient` (deterministic detections for a fixed PNG; same bytes →
   same labels), invalid content type → 415, oversize → 413, health shape, label table integrity (101 + 25 entries, all snake_case, Turkish names non-empty),
   preprocessing shape test, real-model smoke (guarded).
4. Scripts: `scripts/dev-vision.sh` (activate venv, `uvicorn app.main:app --port 8100`, respects `VISION_MOCK`), `scripts/test-vision.sh`
   (creates venv if missing, installs, runs pytest — used by root `pnpm test:vision`), `scripts/dev-all.sh` (starts api with `MONGO_MEMORY=1`,
   vision in mock mode unless model present, admin) with clear log prefixes. `docker-compose.yml` for the whole backend.
5. `apps/vision/README.md`: how to run, env vars, model download, mock mode, latency numbers, licence notes (Apache-2.0 models; no ultralytics).
6. `apps/api/test/vision-contract.test.ts`: when `VISION_URL` is set and `/health` answers, POST a generated PNG through `createVisionClient` and
   assert the shape; otherwise skip with a reason.

## Status (append below)
