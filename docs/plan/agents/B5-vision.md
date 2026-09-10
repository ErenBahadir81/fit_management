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

### 2026-09-10 — service built, real model measured, contract verified live (B5)

**Built** (`apps/vision`, 29 files, pytest-first): `app/settings.py` (env only, Node `zBool` semantics),
`app/labels.py` (101 Food-101 + 25 TurkishFoods labels + Turkish names + CLIP prompts),
`app/imaging.py` (content-type → size → decode → EXIF-transpose → downscale, typed 415/413/400),
`app/predictor.py` (`MockPredictor`, `OnnxFood101Predictor`, `Preprocessor` from the model's own
`preprocessor_config.json`, `ClipGate`), `app/clip_tokenizer.py` (pure-python CLIP BPE — no
`transformers` dependency), `app/limiter.py` (2 in flight, queue 8, then 429), `app/download.py`
(idempotent, atomic, urllib + HF redirects), `app/main.py` (FastAPI, eager load in lifespan,
`{error:{code,message}}` envelope like the Node API).

**Tests**: 109 hermetic (`pnpm test:vision`, no weights needed) · **122 with `RUN_MODEL_TESTS=1`** (2 skip
without `MODEL_TEST_IMAGE`). Mock detections are pinned to reference vectors generated from the Node
`mockAnalysis`, so the two implementations cannot drift silently.

**Measured latency** (4 vCPU, int8 Swin-B, 1024×768 JPEG, median, idle box):

| Path | Median |
|---|---|
| decode + EXIF + downscale | 23 ms |
| classifier alone (`INTRA_OP_THREADS=4`) | 129 ms |
| **HTTP end-to-end, gate off** | **138 ms** (wall 142 ms) |
| HTTP end-to-end, gate on, 4 ORT threads | 522 ms |
| **HTTP end-to-end, gate on, 2 ORT threads** | **284 ms** |
| model load at startup | 1.45 s (+0.55 s CLIP) |

Research predicted 116 ms for this graph; measured 117–129 ms — it reproduces. Real photo →
`pizza @ 0.997`. **New finding:** with the CLIP gate on, two ORT sessions × 4 threads oversubscribe
4 vCPU — dropping `INTRA_OP_THREADS` to 2 nearly halves p50 (522 → 284 ms). Documented in README,
`.env.example` and `docker-compose.yml`.

**CLIP gate** (`CLIP_ENABLED=1`, off by default): page of text → `notFood` at 0.977, pizza → `food` at
0.037, `notFood` ⇒ `detections: []`. Weights missing ⇒ `gate: "off"`, never a crash.

**Verified live end-to-end** (both on port 8100, servers stopped afterwards):
`VISION_URL=… VISION_MOCK=0 pnpm --filter @fitfloow/api exec vitest run test/vision-contract.test.ts`
→ **10/10 in mock mode** (incl. byte-for-byte equality with the Node `mockAnalysis`) and **10/10 against
the real ONNX model**. `pnpm --filter @fitfloow/api typecheck` green.

**Also shipped**: `scripts/dev-vision.sh` · `scripts/test-vision.sh` (venv bootstrap + requirements
freshness stamp) · `scripts/dev-all.sh` (api `MONGO_MEMORY=1` + vision + admin, prefixed logs, one
Ctrl-C) · `apps/vision/Dockerfile` (weights baked in, non-root, HEALTHCHECK) · `apps/api/Dockerfile` ·
`apps/admin/Dockerfile` · `docker-compose.yml` (mongo + vision + api + admin) · `apps/vision/README.md` ·
`.env.example` · `requirements-export.txt` + `scripts/export_onnx.py` (dev-only torch/optimum path).

**Known gaps / notes for the orchestrator**
- Docker images are **not built** here — there is no Docker daemon in this container. `docker compose
  config` validates; the Dockerfiles themselves are unverified by execution.
- `scripts/export_onnx.py` is likewise unexecuted (needs the 1.4 GB torch stack, deliberately not installed).
- `TURKISH_HEAD` is wired in settings but the second head is **not** loaded: `prithivMLmods/TurkishFoods-25`
  ships torch weights only (needs `export_onnx.py`) and the research flags it as unvetted. Turkish dishes
  currently come from mock labels + the API's foods seed.
- `bbox` is always `null` on purpose (no detector — `ultralytics` is AGPL-3.0).
- B4: every label the service can emit must exist as an alias in the foods seed. Mock labels are
  `pizza, hamburger, lahmacun, menemen, kofte, pilav, mercimek_corbasi, salad, omelette, baklava, sushi,
  steak`; real labels are the 101 Food-101 classes in `app/labels.py` (order verified against the
  downloaded `config.json` by a test).
- `apps/vision/models/` is git-ignored: CI/fresh clones start in mock mode until `python -m app.download` runs.
