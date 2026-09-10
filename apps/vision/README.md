# FitFloow Vision (`apps/vision`)

Photo → food labels. A small Python 3.11 / FastAPI service that the API (`apps/api`) calls from
`POST /nutrition/scan`. CPU only, **no torch at runtime** — `onnxruntime` + `pillow` + `numpy`
(237 MB of dependencies instead of 1.4 GB, at identical latency).

Its contract lives in two files that must stay in sync:
`apps/vision/app/main.py` ⟷ `apps/api/src/modules/vision/client.ts`, guarded by
`apps/api/test/vision-contract.test.ts`.

---

## Quick start

```bash
pnpm dev:vision                 # venv + uvicorn on :8100 (mock if no weights are present)
pnpm test:vision                # pytest (creates the venv on first run)

# real model (~93 MB, once):
apps/vision/.venv/bin/python -m app.download
VISION_MOCK=0 pnpm dev:vision
```

```bash
curl -s localhost:8100/health
# {"ok":true,"mock":false,"modelLoaded":true,"modelVersion":"swin-finetuned-food101-ONNX/model_quantized"}

curl -s -F image=@pizza.jpg localhost:8100/v1/analyze
# {"detections":[{"label":"pizza","confidence":0.997,"bbox":null}],
#  "modelVersion":"swin-finetuned-food101-ONNX/model_quantized","mock":false,
#  "latencyMs":138,"imageSize":[1024,768],"gate":"off"}
```

Interactive docs: <http://localhost:8100/docs>.

---

## Endpoints

### `GET /health`

```json
{ "ok": true, "mock": false, "modelLoaded": true, "modelVersion": "swin-finetuned-food101-ONNX/model_quantized" }
```

`mock` and `modelLoaded` are mutually exclusive. The API surfaces this on the admin system-health screen.

### `POST /v1/analyze`

`multipart/form-data`, single field **`image`** (jpeg / png / webp, ≤ 6 MB).

```json
{
  "detections": [{ "label": "pizza", "confidence": 0.997, "bbox": null }],
  "modelVersion": "swin-finetuned-food101-ONNX/model_quantized",
  "mock": false,
  "latencyMs": 138,
  "imageSize": [1024, 768],
  "gate": "off"
}
```

* `label` — the raw model label, snake_case. It is the **join key** with the foods seed
  (`apps/api/src/modules/nutrition/seed/foods.food101.json`), so every label must exist there as an alias.
* `confidence` — 0..1, rounded to 3 decimals, descending. Top-3 above `MIN_CONFIDENCE`, but **never empty**:
  a low-confidence guess plus a picker beats a blank screen.
* `bbox` — always `null` in v1 (single-plate classification; no detector — see *Licences*).
* `imageSize` — what the user uploaded, `[w, h]`, after EXIF rotation and before the server's downscale.
* `gate` — `"food"` / `"notFood"` / `"off"` (see *Open-set gate*). `notFood` ⇒ `detections: []`.

Errors use the same envelope as the Node API:

| Status | `error.code` | When |
|---|---|---|
| 415 | `UNSUPPORTED_MEDIA_TYPE` | content type is not jpeg/png/webp |
| 413 | `PAYLOAD_TOO_LARGE` | body larger than `MAX_UPLOAD_MB` |
| 400 | `INVALID_IMAGE` | undecodable bytes, empty upload, absurd resolution |
| 422 | `VALIDATION` | no `image` field in the multipart body |
| 429 | `BUSY` | inference slots *and* queue full (`Retry-After: 1`) |

---

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `VISION_MOCK` | *(unset)* | `1` always mock · `0` require real weights (fail fast) · unset = real if present, else mock |
| `MODEL_DIR` | `apps/vision/models` | where the weights live (git-ignored) |
| `MODEL_ID` | `onnx-community/swin-finetuned-food101-ONNX` | HF repo the downloader pulls from |
| `MODEL_FILE` | `onnx/model_quantized.onnx` | graph inside that repo |
| `CLIP_ENABLED` | `0` | open-set "is this food?" gate |
| `CLIP_THRESHOLD` | `0.6` | non-food probability above which `gate: "notFood"` |
| `TURKISH_HEAD` | `0` | reserved for the (unvetted) TurkishFoods-25 head |
| `TOP_K` | `3` | candidates returned |
| `MIN_CONFIDENCE` | `0.15` | floor, except for the top-1 |
| `INTRA_OP_THREADS` | `4` | ORT intra-op threads — **use `2` when `CLIP_ENABLED=1`** |
| `MAX_UPLOAD_MB` | `6` | upload cap |
| `MAX_IMAGE_SIDE` | `1024` | server-side downscale before inference |
| `MAX_CONCURRENCY` / `MAX_QUEUE` | `2` / `8` | in-flight inferences / queued requests before 429 |
| `LOG_LEVEL` | `info` | service logger level |

Copy `.env.example` if you want a file; the service reads the environment only.

---

## Models

```bash
.venv/bin/python -m app.download          # classifier: config + preprocessor + 93 MB graph
.venv/bin/python -m app.download --clip   # + CLIP gate (147 MB: text + vision encoders, vocab, merges)
```

Idempotent (skips files whose size already matches), atomic (`.part` + rename), follows HF's
CDN redirects with plain `urllib`, honours `http(s)_proxy` and `SSL_CERT_FILE`. Downloads happen at
build/dev time only — **the service never fetches weights at request time**, it loads them eagerly at
startup and fails fast if `VISION_MOCK=0` and they are missing.

| Component | Repo | File | Size | Licence |
|---|---|---|---|---|
| Classifier | `onnx-community/swin-finetuned-food101-ONNX` | `onnx/model_quantized.onnx` | 93.3 MB | Apache-2.0 |
| Gate (optional) | `Xenova/clip-vit-base-patch32` | `onnx/{text,vision}_model_quantized.onnx` | 61.5 + 85.0 MB | MIT (OpenAI CLIP) |

101 Food-101 labels come from the model's own `config.json`; Turkish display names and the
TurkishFoods-25 label set live in `app/labels.py` (a test asserts the label order still matches the
downloaded config).

### Open-set gate

Both fine-tuned heads are closed-set softmax classifiers: shown a photo of a cat they answer with a
*confident* food label. CLIP scores "a photo of food" and friends against non-food prompts and can say
"none of these". Prompt text embeddings are computed once at startup (encoding them per request is the
classic mistake); per request only the vision encoder runs. Measured: a page of text scores **0.977**
non-food, a real pizza photo **0.037**. Missing CLIP weights ⇒ `gate: "off"` (never a crash).

Tokenisation is a ~60-line pure-python CLIP BPE (`app/clip_tokenizer.py`) over the model's own
`vocab.json` / `merges.txt` — importing `transformers` for a dozen constant prompts is not worth 120 MB.

### Mock mode

`VISION_MOCK=1`, or simply no weights on disk. Detections are derived from `sha256(image bytes)` over a
fixed 12-label list — **the same algorithm, list order and rounding as `mockAnalysis()` in
`apps/api/src/modules/vision/client.ts`**, so Node and Python return identical detections for identical
bytes. That equality is asserted from both sides (`tests/test_predictor.py` uses reference vectors
generated from the Node implementation; `vision-contract.test.ts` compares live responses).
Mock mode logs loudly at startup and sets `mock: true` on every response, so a mis-set env var in
production is impossible to miss.

---

## Measured latency

4 vCPU container, int8 Swin-B, 1024×768 JPEG (642 KB), median of 8–10 runs, service otherwise idle:

| Path | Median |
|---|---|
| Decode + EXIF + downscale | 23 ms |
| Classifier alone (`INTRA_OP_THREADS=4`) | 129 ms |
| **HTTP end-to-end, gate off** | **138 ms** (client-side wall 142 ms) |
| CLIP gate alone | ~120–175 ms |
| HTTP end-to-end, gate on, `INTRA_OP_THREADS=4` | 522 ms |
| **HTTP end-to-end, gate on, `INTRA_OP_THREADS=2`** | **284 ms** |
| Model load at startup | 1.45 s (+0.55 s for CLIP) |

Two ORT sessions each taking 4 threads on 4 cores is textbook oversubscription — hence the
`INTRA_OP_THREADS=2` recommendation when the gate is on. Everything is far inside the 2 s product budget.

**Concurrency:** one uvicorn worker, ORT pinned to `INTRA_OP_THREADS`, at most `MAX_CONCURRENCY`
inferences in flight (in worker threads, so `/health` stays responsive) and `MAX_QUEUE` waiting;
beyond that the service returns **429** instead of piling up.

---

## Tests

```bash
pnpm test:vision                        # 107 tests, hermetic (mock predictor, no weights needed)
RUN_MODEL_TESTS=1 pnpm test:vision      # + real-weights smoke tests (120 total)
MODEL_TEST_IMAGE=/path/to/pizza-x.jpg RUN_MODEL_TESTS=1 pnpm test:vision   # + semantic assertions
pnpm test:vision -- -k imaging -v       # extra args go to pytest
```

Model-backed tests are skipped (with a reason) unless `RUN_MODEL_TESTS=1` **and** the weights are
present. No photo is committed to this repo — point `MODEL_TEST_IMAGE` at one whose filename starts
with the expected label (`pizza-anything.jpg`) to assert the model actually recognises it.

The Node↔Python contract test lives on the API side and skips unless a service answers:

```bash
pnpm dev:vision   # terminal 1
VISION_URL=http://127.0.0.1:8100 VISION_MOCK=0 \
  pnpm --filter @fitfloow/api exec vitest run test/vision-contract.test.ts
```

---

## Docker

```bash
docker build -t fitfloow-vision apps/vision            # bakes the 93 MB model into the image
docker build --build-arg DOWNLOAD_MODEL=0 …            # mock-only image (~240 MB)
docker build --build-arg DOWNLOAD_CLIP=1 …             # + open-set gate
docker compose up --build                              # mongo + vision + api + admin (repo root)
```

Weights are baked in at build time so a cold start never depends on HuggingFace; compose also mounts a
named volume at `/models` so rebuilds keep them. Runs as a non-root user with a `/health` HEALTHCHECK.
`docker compose config` is validated; the images themselves have not been built in this environment
(no Docker daemon available here).

---

## Licences

* Classifier weights — **Apache-2.0** (`onnx-community/swin-finetuned-food101-ONNX`, derived from
  `aspis/swin-finetuned-food101`, 92.1 % top-1 on Food-101).
* CLIP — OpenAI released ViT-B/32 under **MIT**; the HF repo declares no licence tag. Confirm before shipping.
* `onnxruntime` MIT · `fastapi`/`uvicorn`/`pillow` MIT · `numpy` BSD-3.
* **No `ultralytics` / YOLO anywhere.** It is AGPL-3.0, whose network clause would oblige us to publish
  this server's source to its users. That is why `bbox` is always `null`: v1 does single-plate
  classification, and multi-item detection waits for a permissively-licensed detector (or a commercial
  licence). See `docs/research/food-recognition.md` §1.7.
* Optional Turkish head `prithivMLmods/TurkishFoods-25` (Apache-2.0) is **unvetted** (7 downloads,
  single author) — evaluate on real photos before enabling.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `mock: true` when you expected the model | weights missing → `python -m app.download`; check `MODEL_DIR` |
| Startup `RuntimeError: … MODEL_DIR …` | `VISION_MOCK=0` with no weights — that is the fail-fast path working |
| `SSLCertVerificationError` while downloading | `export SSL_CERT_FILE=/path/to/ca-bundle.crt` (also `REQUESTS_CA_BUNDLE`). Never disable verification |
| Latency ~20× worse than the table | something else is using the cores (a `pip install`, another worker). One worker, `INTRA_OP_THREADS` ≤ cores |
| 429s under light load | `MAX_CONCURRENCY` / `MAX_QUEUE` too low for your traffic, or inference is slower than you think — check `latencyMs` |
