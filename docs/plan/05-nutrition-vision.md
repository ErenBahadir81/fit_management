# 05 — Nutrition & AI Food Scan (module B4 API + core, module B5 vision service)

## Foods DB
- Seed file `apps/api/src/modules/nutrition/seed/foods.tr.json` (~300 Turkish staples: ekmek, pilav, bulgur, tavuk göğsü, köfte, kebap
  çeşitleri, mercimek çorbası, menemen, yoğurt, ayran, peynirler, zeytin, meyveler, sebzeler, kuruyemiş, tatlılar…) with per-100g
  kcal/protein/carbs/fat and serving presets. Values from TÜBER/USDA-equivalents (see research). Plus `foods.food101.json`: the 101
  Food-101 labels mapped to canonical foods (label → name TR, per100g, defaultServingG, aliases).
- Search: MongoDB text index + prefix regex on `name`/`aliases` (Turkish lowercase folding: `İ→i, I→ı` handled by normalizing a
  `searchKey` field with diacritics stripped). Ranking: exact prefix > popularity > text score. `remote=1` additionally queries
  Open Food Facts `GET https://world.openfoodfacts.org/cgi/search.pl?search_terms=<q>&search_simple=1&action=process&json=1&page_size=10&fields=code,product_name,nutriments,serving_size`
  (5 s timeout, results normalized to FoodDTO with `source: "off"`, cached in `foods` on first use; OFF search is rate-limited to 10 req/min and
  proved flaky — it is a best-effort extra, never on the hot path). USDA SR Legacy bulk JSON (12.6 MB, public domain) can be imported by the
  admin importer (`source: "usda"`, nutrient ids 1008 kcal / 1003 protein / 1005 carbs / 1004 fat, portions from `foodPortions[].gramWeight`). Barcode:
  `GET https://world.openfoodfacts.org/api/v2/product/<code>.json?fields=…`.
- All remote calls go through `apps/api/src/lib/http.ts` with timeout + retry(1) + in-memory LRU (5 min) and are **mocked in tests**.

## Meal logging
- `totals = round(grams × per100g / 100)`; day totals aggregated per meal and per day in one query (`$group`).
- `dietTargets` auto-mode derives from active goal plan macros (`GoalPlan.macros` for the current roadmap week), else from a
  maintenance estimate (Katch-McArdle × activity) if a body entry exists, else defaults 2000/150/200/65.
- Every entry write invalidates the weekly report cache for that week.

## Scan pipeline (`POST /nutrition/scan`)
1. Accept multipart `image` (jpeg/png/heic→ client converts to jpeg; ≤ 6 MB). Store to `UPLOAD_DIR/scans/<userId>/<id>.jpg`
   (served at `/uploads/...` behind auth) after downscaling to 1024 px max with `sharp`.
2. POST the bytes to the vision service `POST {VISION_URL}/v1/analyze` (multipart). Timeout 20 s.
3. Vision returns `{ detections: [{label, confidence, bbox?}], modelVersion, mock, latencyMs }`.
4. Map each label → food via `foods.aliases` (labels are lowercase snake, e.g. `pizza`, `lahmacun`) → `FoodDTO` + `suggestedGrams`
   (food.defaultServingG). Keep top `settings.vision.maxDetections` with confidence ≥ `minConfidence`; always return at least the top 1.
5. Persist `scans` doc, return `ScanResultDTO`. If the vision service is down → `503 VISION_UNAVAILABLE` with `fallback: "search"` so the
   client can offer manual search (mobile shows a graceful state, never a crash).

## Vision microservice (`apps/vision`, Python 3.11, FastAPI)
```
apps/vision/
  app/main.py            # FastAPI app: GET /health, POST /v1/analyze
  app/model.py           # Predictor protocol: HFClassifier (transformers pipeline on a Food-101 ViT), MockPredictor
  app/labels.py          # label → (label_tr, category) table incl. Turkish dishes for CLIP zero-shot prompts (if CLIP enabled)
  app/settings.py        # env: VISION_MOCK, MODEL_ID (default from research), DEVICE=cpu, TOPK, MIN_CONFIDENCE
  tests/                 # pytest: mock mode end-to-end, label mapping, image validation, top-k logic
  requirements.txt       # fastapi, uvicorn, pillow, python-multipart, pytest, httpx; torch/transformers optional extras
  README.md
```
- **Decisions (from `docs/research/food-recognition.md`, all measured in this container, ~100–120 ms per model on 4 vCPU):**
  - Runtime: **onnxruntime + pillow + numpy** (no torch at runtime; 237 MB install). torch/transformers only in an optional export script.
  - Primary classifier: `onnx-community/swin-finetuned-food101-ONNX` → `onnx/model_quantized.onnx` (93 MB, 92.1 % top-1, Apache-2.0),
    preprocessing from its `preprocessor_config.json` (224×224, ImageNet mean/std). Labels from `config.json` id2label.
  - Open-set gate: `openai/clip-vit-base-patch32` (ONNX export or `Xenova/clip-vit-base-patch32` ONNX files) scoring "a photo of food" vs
    non-food prompts and Turkish-dish prompts; **non-food → empty detections** with key `scan.notFood`. If CLIP weights are unavailable, the
    gate is skipped (flag `gate: "off"` in the response).
  - Optional Turkish head: `prithivMLmods/TurkishFoods-25` (25 dishes, unvetted) behind `TURKISH_HEAD=1`; off by default.
  - No YOLO/ultralytics (AGPL). Single-plate classification, top-3 candidates, user picks/edits grams.
  - Weights: downloaded by `python -m app.download` into `apps/vision/models/` (HF `resolve` URLs, follow redirects); `HF_HUB_OFFLINE` style —
    the service never downloads at request time. Loads eagerly at startup; health reports `modelLoaded`.
  - Label→nutrition: `apps/api/src/modules/nutrition/seed/foods.food101.json` (101 rows) + `foods.tr.json` (Turkish staples incl. the 25
    TurkishFoods classes) — values curated from USDA SR Legacy (public domain) and TÜBER portion tables; every food carries `aliases`
    containing the raw model label so mapping is a pure dictionary lookup.
- **Mock mode** (`VISION_MOCK=1` or model missing): deterministic detections derived from a hash of the image bytes over a fixed label
  list, so tests and demo builds work offline. The API surfaces `mock: true` so the mobile app can label it "demo".
- Response `{ detections: [{label, confidence, bbox: null}], modelVersion, mock, latencyMs, imageSize: [w,h] }`, top-k ≤ 5.
- Health `GET /health` → `{ ok, mock, modelLoaded, modelVersion }`.

## Mobile scan UX (F3) — "AI is thinking" theatre
Camera (expo-camera) → capture → immediately show the photo with a scanning overlay: sweeping gradient line, pulsing corner
brackets, floating particles, a progress label cycling "Görüntü analiz ediliyor… / Yemekler tanınıyor… / Besin değerleri hesaplanıyor…"
(min 1.8 s even if the API is faster, so the animation completes) → results slide up in a bottom sheet: each detection as a card with
confidence chip, food name (TR), grams stepper (± 10 g, long-press accelerates, direct input), live kcal/macros; add/remove detections;
"Ara" fallback to search; meal picker; "Öğüne ekle" → confetti-free but satisfying spring + haptic success → day view updates optimistically.
