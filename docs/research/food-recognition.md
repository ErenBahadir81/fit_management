# Food-image recognition backend for a calorie-tracking module

Research date: **2026-09-10**. Target: FastAPI microservice, Linux container, **4 vCPU / 15 GB RAM, Python 3.11, no GPU**.

All latency numbers below were **measured in this exact container** (4 vCPU, torch 2.9.1+cpu, onnxruntime 1.30.0, `OMP_NUM_THREADS=4`, `torch.set_num_threads(4)`), not quoted from model cards.

---

## 0. Connectivity verification (done first, everything else depends on it)

| Check | Command | Result |
|---|---|---|
| HF file download | `curl -sSL -o /dev/null -w "%{http_code}" https://huggingface.co/nateraw/food/resolve/main/config.json` | **200** (5582 bytes). Bare `curl` without `-L` returns **307** — HF redirects to its CDN, so **always use `-L`**. |
| HF API | `https://huggingface.co/api/models?search=food&sort=downloads` | 200, works |
| PyTorch CPU wheel index | `curl -o /dev/null -w "%{http_code}" https://download.pytorch.org/whl/cpu/torch/` | **200** |
| PyPI | `https://pypi.org/pypi/transformers/json` | 200 |
| Open Food Facts | v2 product endpoint | 200 |
| USDA FDC bulk zips | `fdc.nal.usda.gov/fdc-datasets/...zip` | 200 |
| GitHub raw | `raw.githubusercontent.com` | 200 |
| `r.jina.ai` → github.com | — | **403 blocked** ("AbuseAlleviationError"). Use `raw.githubusercontent.com` instead. |
| GitHub MCP `get_file_contents` | — | **denied** — restricted to the session repo. Use raw.githubusercontent. |

**Conclusion: the model download path works end-to-end.** `transformers.from_pretrained()` and `huggingface_hub.hf_hub_download()` both succeeded live (models were actually pulled and run, see §1).

---

## 1. Pretrained models — measured, not claimed

### 1.1 Measured CPU latency (4 vCPU, 224×224 input, batch 1, median of 8–10 runs)

| Model | Arch | Classes | Weights | Latency (median) | Top-1 |
|---|---|---|---|---|---|
| **`nateraw/food`** | ViT-B/16 (86 M) | 101 | 344 MB `.bin` | **97 ms** (min 95, max 202) | 89.13 % |
| `nateraw/food` exported to ONNX fp32 | ViT-B/16 | 101 | 343 MB (92 KB graph + 328 MB ext. data) | **92 ms** | same |
| `onnx-community/swin-finetuned-food101-ONNX` fp32 | Swin-B | 101 | 352 MB | **118 ms** | 92.10 % |
| same, **`model_quantized.onnx` (int8)** | Swin-B | 101 | **93 MB** | **116 ms** | ~92 % (untested post-quant) |
| **`prithivMLmods/TurkishFoods-25`** | SigLIP2-base (93 M) | **25 Turkish dishes** | 372 MB safetensors | **112 ms** | 91.86 % |
| `openai/clip-vit-base-patch32` zero-shot (image encode + score vs cached text embs) | CLIP ViT-B/32 (151 M) | open vocabulary | 605 MB `.bin` | **84 ms** | — |

> **Everything is comfortably inside the 2 s budget — by a factor of ~20.** Image preprocessing (PIL decode + resize of a 512×512 JPEG) costs only **3 ms** and is not the bottleneck.
>
> **A methodology warning worth recording:** my *first* measurement of `nateraw/food` read **2358 ms median**, because a `pip install` was running concurrently on the same 4 vCPUs. Re-run on an idle container: **103 ms**. If you benchmark this service in CI alongside other jobs, expect the same ~20× distortion. Size the container so the worker is not competing for cores, and pin `torch.set_num_threads()`.

### 1.2 Primary recommendation: `nateraw/food`

* **Repo id:** `nateraw/food` — <https://huggingface.co/nateraw/food>
* **Base:** `google/vit-base-patch16-224-in21k`, fine-tuned on Food-101
* **Labels:** 101, snake_case (`apple_pie`, `baby_back_ribs`, `baklava`, …, `waffles`)
* **Accuracy:** 0.8913 top-1 (from `eval_results.json` in-repo, verified)
* **Size:** `pytorch_model.bin` = **343,584,369 B (344 MB)**
* **License:** **Apache-2.0** (commercially safe)
* **Last modified:** 2022-05-17 (stale, but Food-101 is a frozen benchmark — staleness is not a defect here)
* **Downloads:** 2,706/30d, 81 likes — the most-downloaded food classifier on HF
* **Caveat:** ships only `pytorch_model.bin`, **no `model.safetensors`**. Recent `transformers` requires `torch` to load `.bin` (and refuses it under some hardened configs). Convert once to safetensors at build time if you care.

```python
from transformers import pipeline
clf = pipeline("image-classification", model="nateraw/food", device=-1)  # -1 = CPU
print(clf("meal.jpg", top_k=5))
# [{'label': 'beignets', 'score': 0.997}, {'label': 'donuts', 'score': 0.0004}, ...]
```

Explicit form (what you actually want in a service — processor and model loaded once at startup):

```python
import torch
from transformers import AutoImageProcessor, AutoModelForImageClassification
torch.set_num_threads(4)
proc = AutoImageProcessor.from_pretrained("nateraw/food")
model = AutoModelForImageClassification.from_pretrained("nateraw/food").eval()

def classify(pil_img, top_k=5):
    with torch.inference_mode():
        logits = model(**proc(images=pil_img, return_tensors="pt")).logits
    probs = logits.softmax(-1)[0]
    top = probs.topk(top_k)
    return [{"label": model.config.id2label[i], "score": float(s)}
            for s, i in zip(top.values, top.indices)]
```

### 1.3 Higher-accuracy alternative: Swin Food-101 (ONNX)

* **Repo:** `onnx-community/swin-finetuned-food101-ONNX` (Apache-2.0, last modified **2026-01-19** — the most recently maintained option)
* Derived from `aspis/swin-finetuned-food101`, **92.10 % top-1** (vs 89.13 % for ViT)
* Ships 8 pre-quantized variants. Measured sizes:

| file | bytes | measured latency |
|---|---|---|
| `onnx/model.onnx` (fp32) | 352,389,545 | 118 ms |
| `onnx/model_fp16.onnx` | 177,017,515 | — |
| `onnx/model_quantized.onnx` = `model_int8.onnx` = `model_uint8.onnx` | **93,297,500** | 116 ms |
| `onnx/model_q4.onnx` | 60,448,784 | — |

> **int8 buys size, not speed.** 93 MB vs 352 MB (3.8× smaller) at the *same* 116 ms. On this CPU the dynamic-quant dequantise overhead cancels the arithmetic win. Take int8 for a smaller image and lower RAM, not for latency.

```python
import numpy as np, onnxruntime as ort, json
from huggingface_hub import hf_hub_download
from PIL import Image

REPO = "onnx-community/swin-finetuned-food101-ONNX"
so = ort.SessionOptions(); so.intra_op_num_threads = 4
sess = ort.InferenceSession(hf_hub_download(REPO, "onnx/model_quantized.onnx"), so,
                            providers=["CPUExecutionProvider"])
id2label = json.load(open(hf_hub_download(REPO, "config.json")))["id2label"]
MEAN = np.array([.485,.456,.406], np.float32); STD = np.array([.229,.224,.225], np.float32)

def classify(path):
    x = np.asarray(Image.open(path).convert("RGB").resize((224,224)), np.float32)/255.
    x = ((x-MEAN)/STD).transpose(2,0,1)[None]
    logits = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]
    e = np.exp(logits-logits.max()); p = e/e.sum()
    return [(id2label[str(i)], float(p[i])) for i in p.argsort()[-5:][::-1]]
```

### 1.4 Turkish dishes: `prithivMLmods/TurkishFoods-25` — the standout find

This is a **ready-made Turkish food classifier**, exactly the localisation gap you'd otherwise have to fill by hand.

* **Repo:** <https://huggingface.co/prithivMLmods/TurkishFoods-25> · Apache-2.0 · SigLIP2-base-patch16-224 · 372 MB · last modified 2025-05-07
* **Accuracy 91.86 %** (weighted F1 0.9186) over 9,168 eval images — full per-class report is in the model card
* **25 classes:** `asure, baklava, biber_dolmasi, borek, cig_kofte, enginar, et_sote, gozleme, hamsi, hunkar_begendi, icli_kofte, ispanak, izmir_kofte, karniyarik, kebap, kisir, kuru_fasulye, lahmacun, lokum, manti, mucver, pirinc_pilavi, simit, taze_fasulye, yaprak_sarma`
* Trained on `yunusserhat/TurkishFoods-25` (11,461 images, Apache-2.0, <https://huggingface.co/datasets/yunusserhat/TurkishFoods-25>). A 15-class predecessor exists: `yunusserhat/TurkishFoods-15`.
* Weakest classes: `et_sote` (F1 0.78), `kebap` (0.886), `borek` (0.881), `mucver` (0.897).
* Low adoption (7 downloads, 0 likes) — **treat as unvetted; run your own eval before shipping.**

> **⚠️ Measured failure mode that shapes the architecture.** I fed this model a photo of *beignets* (not a Turkish dish, out of its label set). It returned **`lokum` with 0.888 confidence**. It is a closed-set softmax classifier with no "none of these" class, so it is *confidently wrong* off-domain. **You cannot route to it unconditionally.** See §6 for the gating design.

### 1.5 Smaller / lighter classifiers (evaluated, mostly rejected)

| Repo | Verdict |
|---|---|
| `Kaludi/food-category-classification-v2.0` | Swin, **only 12 coarse categories** (Bread, Dairy, Dessert, Egg, Fried Food, Fruit, Meat, Noodles, Rice, Seafood, Soup, Vegetable), 96.0 % acc, 348 MB, **no license declared on the repo** → legally unusable as-is. Too coarse for calories anyway ("Meat" maps to no kcal). Useful only as a sanity gate. 824 dl/30d. |
| `prithivMLmods/Food-101-93M` | SigLIP2 Food-101, Apache-2.0, 372 MB, updated 2025-04-05. Reasonable modern alternative to `nateraw/food`; no published top-1 in card. |
| `Lumia101/Food101-EfficientNet-B0` | **19 MB**, MIT — smallest by far. But **79.57 %** top-1 and the card explicitly says *"not compatible with timm or transformers"* (custom classifier head, needs hand-rolled torchvision loading). Not worth 10 points of accuracy to save 300 MB. |
| `evalstate/food101-mobilenet-demo` | 6.5 MB, but `eval_accuracy: 1.0` on 100 samples and **`id2label` is empty** — a broken toy. **Do not use.** |
| `gabrielganan/efficientnet_b1-food101` | Apache-2.0, no metrics published, 52 dl. Unvetted. |
| `juliensimon/autotrain-food101-*` | **Searched — no such repo is discoverable on the HF API today.** Treat as dead. |

### 1.6 CLIP zero-shot (open vocabulary)

* `openai/clip-vit-base-patch32` — 21,008,990 downloads/30d, 1,366 likes, the safest dependency on this list. **License: the repo declares none in tags; OpenAI released CLIP under MIT.** Confirm before shipping.
* **Measured 84 ms** for image-encode + cosine scoring — *provided you precompute and cache the text embeddings at startup*. Encoding the label prompts per request would add ~50 ms × N labels and is the classic mistake.

```python
import torch
from transformers import CLIPProcessor, CLIPModel
proc = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
clip = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").eval()

LABELS = ["a photo of lahmacun", "a photo of mercimek çorbası, lentil soup", ...]
with torch.inference_mode():                      # ---- once, at startup ----
    t = clip.get_text_features(**proc(text=LABELS, return_tensors="pt", padding=True))
    TEXT_EMB = t / t.norm(dim=-1, keepdim=True)

def zero_shot(pil_img):                            # ---- per request, 84 ms ----
    with torch.inference_mode():
        i = clip.get_image_features(**proc(images=pil_img, return_tensors="pt"))
        i = i / i.norm(dim=-1, keepdim=True)
        return (100 * i @ TEXT_EMB.T).softmax(-1)[0]
```

Use it as an **open-set gate and re-ranker**, not as the primary classifier — zero-shot CLIP on Food-101 is roughly 80–88 %, below the fine-tuned ViT.

### 1.7 Multi-item detection (bounding boxes) — the weak spot

There is **no well-maintained, permissively-licensed, ready-made food *detector*.** Findings:

| Candidate | Reality |
|---|---|
| `arunapb/yolo11l-food-segmentation` | Best available. YOLO11l-seg on **FoodSeg103, 103 ingredient classes**, Apache-2.0 weights, `best.pt` = **222 MB**, updated 2026-05-18. But **only 1 like / 131 downloads, and the card publishes no mAP at all** — accuracy is entirely unknown. |
| `wuriyanto/yolo8-indonesian-food-detection-v1` | MIT, but Indonesian cuisine, 5 downloads. Irrelevant. |
| `lannguyen0910/food-recognition` (375★) | Integrates YOLOv5/v8 + classification + segmentation. **README states: *"All trained checkpoints on custom data have been lost. Now use pretrained models on COCO for inference."*** The food-specific weights are gone. Architecture reference only. |
| `magnusdtd/yolov8-foodseg103`, `funmania/yolov8_foodseg103` | 0 downloads, no cards. |
| UECFOOD256 YOLO weights | Only found via `jianing-sun/Food-Detection-by-YOLOv2-with-Transfer-Learning` — YOLOv2/darknet era, not loadable by modern tooling. |

> **🚨 Licensing blocker — `ultralytics` is AGPL-3.0.** Confirmed from PyPI metadata (v8.4.146, `License: AGPL-3.0`, classifier `GNU Affero General Public License v3 or later`). AGPL's network clause means **running it inside your fitness-app backend obliges you to release your server source to your users**, unless you buy an Ultralytics Enterprise licence. The *weights* being Apache-2.0 does not help — the **runtime** is the problem.
>
> **Recommendation: do not ship YOLO in v1.** If you later need multi-item boxes, either (a) buy the Ultralytics commercial licence, (b) export the `.pt` to ONNX once on a dev machine and ship only `onnxruntime` + your own NMS post-processing (removes the runtime dependency; the export step itself still uses AGPL code, so take legal advice), or (c) use a permissive detector family (DETR/RT-DETR via `transformers`, Apache-2.0) fine-tuned on FoodSeg103 yourself.

---

## 2. Open-source complete calorie-counting projects

| Project | Stars | What it actually contains | Reusable? |
|---|---|---|---|
| **[simonoppowa/OpenNutriTracker](https://github.com/simonoppowa/OpenNutriTracker)** | **2,504** ★, active (updated 2026-09-10) | Flutter/Dart mobile calorie tracker. Off-line-first, Open Food Facts + FDC backed, barcode scanning, TDEE calculation, clean architecture. **GPLv3.** **No image recognition at all.** | **Not as code** (Dart, and GPLv3 would infect your app). **Yes as a design reference** — its nutrition data model, OFF integration and TDEE math are the best-validated open example of exactly the domain layer you need. There is also a nascent `OpenNutriTracker-Backend` (PLpgSQL, 1★, started 2026-07) — too early to use. |
| **[lannguyen0910/food-recognition](https://github.com/lannguyen0910/food-recognition)** | 375 ★ | Flask app: YOLOv5/v8 detection + classification + semantic segmentation + nutrient charts. Last real work 2024-05. | **Architecture reference only.** Its own README says the trained food checkpoints **were lost**. You'd be re-training from scratch. |
| **[jamesjg/FoodSAM](https://github.com/jamesjg/FoodSAM)** | 185 ★ | SAM + semantic segmenter + object detector for instance/panoptic food segmentation on FoodSeg103. IEEE TMM paper. | **No.** SAM ViT-H is ~2.4 GB and needs a GPU for interactive rates. Far outside a 4-vCPU budget. Interesting for a future server-side "premium" path only. |
| **[google-research-datasets/Nutrition5k](https://github.com/google-research-datasets/Nutrition5k)** | 416 ★, **archived** | 5,006 plates with per-ingredient mass, total mass, kcal, fat/protein/carb. Includes RGB-D. **Dataset, not a model.** Download is **181.4 GB**. | **Not directly.** Too big to pull into a container. Valuable as *ground truth for portion/gram calibration* if you ever train a mass regressor — but that's a project, not an integration. Its linked TF-Hub `mobile_food_segmenter_V1` is the practical artefact. |
| `meghanamreddy/Calorie-estimation-from-food-images-OpenCV` (95★), `vinayaksable2399/Food-Calories-Estimation-Using-Image-Processing` (76★) | small | Classic CV: segment food, use a **coin as a size reference**, compute volume → calories. | **Method reference for §4.** The coin-reference trick is the only credible low-compute gram estimator, but requires user compliance. |
| `qunshansj/Food_Calorie_and_Energy_Estimation_System` (69★) | — | Chinese YOLO-based calorie system, "source + deployment + dataset" bundle. | Inherits the AGPL YOLO problem. |

**Bottom line: there is no ready-made OSS backend that does image → food → nutrition end-to-end that you can drop in.** The pieces (classifier, nutrition DB, gram tables) all exist separately and are each ~50 lines to wire. Build the microservice; borrow OpenNutriTracker's *data model*.

---

## 3. Nutrition databases

### 3.1 Open Food Facts — good for barcodes, weak for cooked dishes

**Verified working (live response captured):**

```bash
curl -sS -A "YourApp/1.0 (contact@yourdomain.com)" \
  "https://world.openfoodfacts.org/api/v2/product/3017624010701.json?fields=code,product_name,brands,nutriments,serving_size"
```

```json
{ "code": "3017624010701",
  "product": {
    "brands": "Ferrero",
    "nutriments": {
      "energy-kcal_100g": 539,  "energy-kj_100g": 2227.9,
      "carbohydrates_100g": 57.5, "proteins_100g": 6.3, "fat_100g": 30.9,
      "saturated-fat_100g": 10.6, "sugars_100g": 56.3,
      "salt_100g": 0.1075, "sodium_100g": 0.043
    } } }
```

The `*_100g` suffix is exactly your per-100 g contract. Read `energy-kcal_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g`.

**Rate limits (official):** **15 req/min/IP** for product reads, **10 req/min/IP** for search. Exceeding returns HTTP 503. A `User-Agent` identifying your app is required by their terms.

**Search — two endpoints, one is currently unreliable:**

| Endpoint | Status when tested (2026-09-10) |
|---|---|
| `GET /api/v2/search?categories_tags_en=pizzas&fields=...` | ❌ returned an HTML **"Page temporarily unavailable"** interstitial, not JSON |
| `GET /cgi/search.pl?search_terms=lentil+soup&json=1&page_size=2&fields=code,product_name,nutriments` | ✅ **worked** — `{"count":512,"page":1,...,"products":[...]}` |
| `GET https://search.openfoodfacts.org/search?q=lentil+soup&page_size=2` (search-a-licious) | ✅ worked, returns `{"hits":[...]}` — but note `last_indexed_datetime: 2024-10-26`, i.e. a **stale index** |

> **Design consequence: never put OFF search on your image-recognition hot path.** It is rate-limited to 10/min, one of its two search endpoints was down during testing, and the other has a two-year-old index. Use OFF **only** for the barcode-scanning feature (a different user flow), and back the image path with a local table (§3.2/§3.4).

**Offline option:** full CSV dump at `https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz` (302-redirects; multi-GB). Mostly *branded packaged goods* — poor coverage of "a plate of mercimek çorbası", which is what a meal photo actually contains. **ODbL licence** — attribution and share-alike on derived databases.

### 3.2 USDA FoodData Central — recommended offline base

**API needs a key.** `DEMO_KEY` is effectively unusable: my very first call returned

```json
{"error":{"code":"OVER_RATE_LIMIT","message":"You have exceeded your rate limit..."}}
```

with headers `x-ratelimit-limit: 10`, `x-ratelimit-remaining: 0` — the DEMO_KEY quota is **shared globally across all api.data.gov users**, so it is exhausted essentially always. Free personal key: <https://fdc.nal.usda.gov/api-key-signup> (1,000 req/hour).

**Skip the API — bulk-download instead. All verified `200 OK`, `Content-Type: application/zip`:**

| Dataset | URL | Compressed | Uncompressed | Records |
|---|---|---|---|---|
| **SR Legacy (JSON)** ⭐ | `https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2021-10-28.zip` | **12,566,612 B (12.6 MB)** | 210 MB | **7,793 foods** |
| Foundation Foods (JSON) | `https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2025-04-24.zip` | 462,497 B (462 KB) | 6.6 MB | 340 foods |
| Full CSV (all types incl. Branded) | `https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_csv_2025-04-24.zip` | 474,868,261 B (475 MB) | — | ~2 M |

**SR Legacy is the right choice**: 7,793 generic *cooked-dish* foods, 12.6 MB download, and **USDA data is public domain (no licence obligations at all)** — unlike OFF's ODbL.

**Verified structure** (I downloaded and parsed it):

```
{"SRLegacyFoods": [ { "fdcId": 168957,
    "description": "Pizza rolls, frozen, unprepared",
    "foodNutrients": [ {"nutrient": {"id": 1008, "name": "Energy", "unitName": "kcal"}, "amount": 328}, ... ],
    "foodPortions": [ {"modifier": "serving", "gramWeight": 34.0}, ... ] } ] }
```

**Nutrient IDs you need (all amounts are per 100 g):**

| id | nutrient | unit |
|---|---|---|
| **1008** | Energy | kcal |
| **1003** | Protein | g |
| **1005** | Carbohydrate, by difference | g |
| **1004** | Total lipid (fat) | g |

Extraction, verified against the real file:

```python
import json, zipfile
WANT = {1008: "kcal", 1003: "protein_g", 1005: "carb_g", 1004: "fat_g"}
with zipfile.ZipFile("sr_legacy.zip") as z:
    data = json.loads(z.read(z.namelist()[0]))["SRLegacyFoods"]
rows = []
for it in data:
    m = {WANT[n["nutrient"]["id"]]: n.get("amount")
         for n in it.get("foodNutrients", []) if n["nutrient"]["id"] in WANT}
    rows.append({"fdc_id": it["fdcId"], "name": it["description"], **m,
                 "portions": [(p.get("modifier"), p.get("gramWeight"))
                              for p in it.get("foodPortions", [])]})
# -> {'fdc_id': 168957, 'name': 'Pizza rolls, frozen, unprepared',
#     'kcal': 328, 'protein_g': 8.73, 'carb_g': 50.7, 'fat_g': 9.98}
```

`foodPortions[].gramWeight` gives you **USDA's own household-serving gram weights** — this is the single best free source for the "default serving grams" column in §4.

### 3.3 Food-101 → nutrition mapping

No canonical/authoritative mapping exists. Options:
* **Kaggle `sanadalali/food-101-nutritional-information`** — a pre-built Food-101 × (calories, protein, carbs) CSV. Needs a Kaggle account; **provenance unverified — audit before trusting.**
* **Do it yourself, once (recommended).** 101 rows is an afternoon: for each Food-101 class, pick the closest SR Legacy `description` by hand, freeze the `fdc_id`, and commit the resulting CSV to the repo. A hand-curated 101-row table you can defend beats a scraped one you can't. Ship it as data, not as a runtime lookup.

### 3.4 Turkish nutrition data

| Source | Status |
|---|---|
| **TürKomp** (Ulusal Gıda Kompozisyon Veri Tabanı) — <https://turkomp.gov.tr> | The official Turkish food composition database: **~63,000 data points, 100 components, 645 foods, 14 food groups**, free, TR + EN. **No public API and no bulk download** — both `turkomp.gov.tr/main` and `turkomp.tarimorman.gov.tr/database` returned **302 redirects** to a session-based web UI when probed. Would require scraping ~645 pages. Check their terms first. |
| **TÜBER 2022** (Türkiye Beslenme Rehberi, Sağlık Bakanlığı) | **PDF only**, no machine-readable release: <https://hsgm.saglik.gov.tr/media/attachments/2025/05/12/turkiye-beslenme-rehberi-2022.pdf>. Its real value is the **portion-weight tables** (§4) and national reference intakes, not per-100 g composition. |
| CSV of Turkish dishes with kcal/100 g | **Nothing free, authoritative and machine-readable was found.** |

> **Practical answer: hand-curate ~30–60 rows.** Your Turkish label set is only 25 classes (§1.4). Curating kcal/protein/carb/fat + default grams for 25 dishes from TÜBER's portion tables and TürKomp lookups is a bounded one-off task, and it makes the Turkish path *better* than anything automated — these are exactly the dishes a generic USDA match would get wrong (`karnıyarık` is not "eggplant, cooked").

---

## 4. Portion / gram estimation on CPU

**Set expectations honestly: this is the least solvable part of the problem.** State-of-the-art *single-image* volume estimation reports **MAPE ≈ 37.8 % for volume and 42.7 % for energy**; a multi-task learning approach reports **MAE ≈ 56.8 kcal**. Those are research numbers, on curated data, usually with depth or 3D scaling. On a phone snapshot with no reference object, you will do worse.

**Therefore: do not try to estimate grams from pixels in v1.** The brief already has the right answer built in — *"let the user adjust grams."* Lean on that.

Ranked by cost/benefit:

1. **Per-class default serving grams table (do this).** One number per class. Zero compute, zero latency, no failure mode. Sources: USDA `foodPortions[].gramWeight` (§3.2) and TÜBER's portion tables for Turkish dishes. Pre-fill the UI with it and let the user drag a slider. **This is ~90 % of the value for ~1 % of the effort.**
2. **Serving-size presets instead of a raw gram slider.** Offer "½ / 1 / 1.5 / 2 portions" chips backed by the default grams. Users estimate *portions* far more reliably than *grams*, and it's a better UI than a number field.
3. **Plate-diameter heuristic (optional, later).** A circular plate is the standard referent in the literature: detect the plate ellipse, assume a 26–28 cm diameter, convert food pixel-area → cm², then apply a per-class area→mass density factor. Cheap (OpenCV Hough circles, ~10 ms). But it needs a top-down shot, breaks on bowls, and the plate-size assumption injects its own error.
4. **Reference object (coin / bank card).** Most accurate of the cheap methods, used by `meghanamreddy/Calorie-estimation-from-food-images-OpenCV`. Requires the user to place an object in frame — **almost no one will**. Ship as an optional "precision mode" at most.
5. **Depth / 3D / RGB-D regression (Nutrition5k-style).** Correct approach, wrong budget. Needs the 181 GB dataset, a training run, and realistically a GPU. Out of scope.

**Keep the API honest:** return `grams_estimated` with a `source` field (`"class_default"` / `"plate_heuristic"` / `"user"`) and a confidence band, so the client can show "~180 g, tap to adjust" rather than implying a measurement.

---

## 5. Stack, sizes and licences — all measured

### 5.1 PyPI / wheel facts (verified live)

| Package | Version | Wheel size (cp311 linux x86_64) | Licence |
|---|---|---|---|
| `torch` (**PyPI default**) | 2.14.0 | **554.6 MB** (bundles CUDA deps) | BSD-3 |
| **`torch` (CPU index)** ⭐ | 2.9.1+cpu | **184,452,625 B = 184 MB** | BSD-3 |
| `torchvision` (CPU index) | 0.29.0+cpu | 1,708,095 B = 1.7 MB | BSD-3 |
| `transformers` | 5.17.0 | 12.3 MB | Apache-2.0 |
| `onnxruntime` | 1.30.0 | 23.6 MB | **MIT** |
| `timm` | 1.0.29 | 2.6 MB | Apache-2.0 |
| `fastapi` | 0.141.1 | 0.1 MB | MIT |
| `uvicorn` | 0.52.4 | 0.1 MB | BSD-3 |
| `pillow` | 12.3.0 | 6.9 MB | MIT-CMU |
| `numpy` | 2.5.3 | 17.0 MB | BSD-3 |
| `ultralytics` | 8.4.146 | 1.4 MB | **🚨 AGPL-3.0** |

> **Always install torch from the CPU index.** `pip install torch` pulls the 554 MB CUDA-bundled wheel plus ~2 GB of `nvidia-*` packages — pure waste in a CPU container.
> ```
> pip install --index-url https://download.pytorch.org/whl/cpu torch==2.9.1 torchvision
> ```
> (This exact command was used to build the benchmark venv; the index is reachable and returns 200.)

### 5.2 Installed footprint (measured with `du -sh` in this container)

| Stack | Installed size |
|---|---|
| `onnxruntime` + `pillow` + `numpy` + `fastapi` + `uvicorn` + `huggingface_hub` | **237 MB** |
| `torch(cpu)` + `torchvision` + `transformers` + `onnxruntime` + `timm` + `optimum` | **1.4 GB** |
| — of which `torch` alone | 728 MB |
| — of which `transformers` alone | 119 MB |
| — of which `onnxruntime` alone | 67 MB |

### 5.3 Recommendation: **ONNX Runtime, no torch, in production**

The decision is **not** about latency — 92 ms (ONNX ViT) vs 97 ms (torch ViT) is noise. It is about **image size and cold start**:

* **237 MB vs 1.4 GB installed** — a 6× smaller container, materially faster pulls and autoscaling.
* `onnxruntime` is **MIT**; you drop `torch`'s 728 MB and the whole `transformers` loading machinery.
* Model weights: **93 MB** (int8 Swin) instead of 344 MB.
* **Total runtime image ≈ 330 MB** vs ≈ 1.75 GB for the torch path.

Keep `torch` + `transformers` in a **separate build/dev image** for the one-time ONNX export and for evaluation. Production serves ONNX only.

---

## 6. Recommended architecture

### 6.1 Model pipeline

```
                     ┌──────────────────────────────────────────┐
  photo ──► decode ──┤ 1. CLIP gate (open-set)          ~84 ms   │
   (3 ms)            │    "food" vs "not food" +                 │
                     │    "Turkish dish" vs "western dish"       │
                     └───────────────┬──────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
      2a. Food-101 classifier                 2b. TurkishFoods-25
          Swin int8 ONNX  ~116 ms                 SigLIP2  ~112 ms
          101 classes, 92.1 %                     25 classes, 91.9 %
                 └───────────────────┬───────────────────┘
                                     ▼
                     3. label → canonical food entry
                        (kcal / protein / carb / fat per 100 g
                         + default_grams)          <1 ms, in-process dict
                                     ▼
                     4. JSON: items[] + grams (user-adjustable)
```

**Total budget: ~200 ms p50, well under 2 s.** Even the worst case (CLIP gate + both classifiers + decode) is ~315 ms.

**Why the CLIP gate is not optional.** §1.4 measured `TurkishFoods-25` returning `lokum @ 0.888` for a photo of beignets. Both fine-tuned classifiers are closed-set and cannot say "I don't know". The CLIP gate is the only component that can, because it scores against an open vocabulary. Two jobs:
* **Reject non-food** ("a photo of food" vs "a photo of a person / a screenshot / a pet") → return `items: []` with a friendly message rather than a hallucinated kebab.
* **Route** between the Turkish and Food-101 heads, or run both and let CLIP's similarity to the winning label break the tie.

Also enforce a **confidence floor** (start at ~0.35 top-1, tune on your own eval set) and return the **top-3** rather than the argmax. The UI should present "Is this X? — or Y, Z" and let the user pick. A picker with three options is a better product than a wrong single answer, and it gives you free labelled data for later fine-tuning.

**Ship v1 without detection.** One label + user-adjustable grams. Add multi-item boxes only when the data says users photograph multi-dish plates often enough to justify the AGPL licence purchase (§1.7).

### 6.2 Label → nutrition mapping

One committed CSV, loaded into a dict at startup. Schema:

```csv
class_key,source,fdc_id,name_en,name_tr,kcal_100g,protein_100g,carb_100g,fat_100g,default_grams,portion_label_tr
apple_pie,food101,175040,Apple pie,Elmalı turta,237,2.4,34.0,11.0,125,1 dilim
pizza,food101,168957,Pizza,Pizza,266,11.0,33.0,10.0,150,1 dilim
lahmacun,turkish25,,Lahmacun,Lahmacun,240,11.5,32.0,7.5,180,1 adet
kuru_fasulye,turkish25,,White bean stew,Kuru fasulye,135,7.2,19.0,3.1,250,1 kase
```

* `class_key` is the model's raw label — the join key, so the mapping is a pure function of model output.
* 101 Food-101 rows + 25 Turkish rows = **126 rows total.** Small enough to hand-curate and code-review, which is the point: this table is where wrong calorie numbers come from, so it should be auditable, versioned, and diffable.
* `default_grams` from USDA `foodPortions[].gramWeight` (§3.2) and TÜBER portion tables.
* **Turkish localisation lives in this table**, not in the model. `name_tr` + `portion_label_tr` give you the whole TR UI for free, and adding a language is one more column — no retraining.

Keep OFF strictly on the **barcode** flow, hitting the API live (15 req/min) with a local cache.

### 6.3 Fallback / mock mode (required)

Model download is the single biggest startup failure risk — HF is reachable today but is an external dependency on every cold start.

1. **Bake weights into the image at build time.** `hf_hub_download` during `docker build`, then set `HF_HUB_OFFLINE=1` at runtime. This removes the runtime dependency entirely and is the main recommendation.
2. **Persistent cache volume** on `HF_HOME` as a second line of defence.
3. **Explicit mock mode** — `FOOD_MODEL_MODE=mock` — returning a deterministic response keyed by a hash of the image bytes:

```python
import hashlib
def mock_classify(image_bytes, top_k=3):
    h = int(hashlib.sha256(image_bytes).hexdigest(), 16)
    labels = sorted(NUTRITION_TABLE)               # deterministic order
    picks = [labels[(h >> (8*i)) % len(labels)] for i in range(top_k)]
    return [{"label": l, "score": round(0.9 - 0.2*i, 3)} for i, l in enumerate(picks)]
```

   Deterministic (same image → same answer, so tests can assert exact values), needs no weights, and keeps CI fast and hermetic. **Have the service log loudly and expose `"mode": "mock"` in `/health` and in every response** so a mis-set env var in production is impossible to miss.
4. **Startup health gate:** load the model eagerly at startup, not lazily on first request — fail fast and let the orchestrator restart, rather than serving 30-second first requests.

### 6.4 Serving notes

* **Threads:** set `torch.set_num_threads(4)` / `SessionOptions.intra_op_num_threads = 4` and run **one worker**. Do *not* run 4 uvicorn workers each spawning 4 ORT threads — 16 threads on 4 cores is exactly the oversubscription that produced my bogus 2358 ms reading (§1.1).
* **Concurrency:** ~120 ms/inference on 4 cores ≈ **8 req/s** sustained single-worker. Put inference behind a small queue/semaphore and return 429 rather than letting requests pile up.
* **Memory:** ONNX int8 Swin session ≈ 150–250 MB RSS. Trivial against 15 GB — the container is CPU-bound, not memory-bound, so size for cores.
* Cap upload size and downscale to 224×224 server-side before inference; reject non-image content types.

---

## 7. Summary of concrete recommendations

| Decision | Choice | Why |
|---|---|---|
| Primary classifier | `onnx-community/swin-finetuned-food101-ONNX` (`model_quantized.onnx`, 93 MB) | 92.1 % top-1, 116 ms, Apache-2.0, most recently maintained, no torch needed |
| Fallback / simpler | `nateraw/food` (ViT-B/16, 344 MB) | 89.1 %, 97 ms, Apache-2.0, most-used, trivially loadable via `pipeline()` |
| Turkish dishes | `prithivMLmods/TurkishFoods-25` | 91.9 % on 25 Turkish dishes, Apache-2.0 — **audit before shipping** (7 downloads) |
| Open-set gate | `openai/clip-vit-base-patch32`, text embeddings cached | 84 ms; the only component that can say "not food" |
| Detection (YOLO) | **Defer** | No good permissive weights; `ultralytics` is **AGPL-3.0** |
| Nutrition base | **USDA SR Legacy JSON**, 12.6 MB → 7,793 foods | Public domain, offline, has per-100 g macros *and* gram portions |
| Barcode path only | Open Food Facts v2 | 15 req/min; ODbL; search endpoint proved unreliable |
| Turkish nutrition | Hand-curate ~25 rows from TÜBER / TürKomp | No machine-readable Turkish source exists |
| Grams | Per-class default + user slider | SOTA single-image estimation is still ~40 % MAPE |
| Runtime stack | `onnxruntime` + `pillow` + `numpy` + `fastapi` + `uvicorn` (**237 MB**) | 6× smaller than the torch stack at identical latency |
| Build stack | `torch(cpu)` + `transformers` (separate image) | One-time ONNX export and evaluation only |

### Open questions to resolve before implementation
1. **`prithivMLmods/TurkishFoods-25` is essentially unvetted** (7 downloads, one author). Run it against your own Turkish photos before committing the Turkish path to it.
2. **CLIP's licence is not declared in the HF repo tags.** OpenAI released CLIP under MIT; confirm for commercial use.
3. **`arunapb/yolo11l-food-segmentation` publishes no mAP.** If detection ever matters, that number has to be measured, not assumed.
4. **The 126-row nutrition table is the accuracy bottleneck**, not the model. Budget real curation time for it — a 92 %-accurate classifier feeding a sloppy kcal table produces bad calorie numbers.
