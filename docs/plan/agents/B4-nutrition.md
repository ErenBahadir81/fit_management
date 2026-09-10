# B4 — Nutrition: foods DB, search, barcode, meal log, targets, week view, AI scan endpoint, admin foods/scans

Model: Opus (high effort). Read `COMMON.md` first. Plan docs: `05-nutrition-vision.md`, `02-api-contract.md` (Nutrition, Admin foods/scans),
`01-data-model.md`, research `docs/research/food-recognition.md` (§3 nutrition DBs, §6.2 label→nutrition table).
Legacy: `pnpm legacy src/app/api/diet/route.ts`, `pnpm legacy src/components/diet/meta.ts`.

## You own
- `packages/core/src/nutrition/**` (`totals.ts`: `entryTotals(grams, per100g)`, `sumTotals`, `remaining`, `adherence`; `search.ts`: query
  normalization using core `searchKey`; `food101.ts`: the 101 Food-101 labels + Turkish names; tests)
- `apps/api/src/modules/nutrition/**` including `seed/` (`foods.tr.json`, `foods.food101.json`, `index.ts` exporting `seedFoods()`),
  `off.ts` (Open Food Facts client via `ctx.http`), `usda.ts` (importer via `ctx.http`), `scan.service.ts`, `uploads.ts`
- `apps/api/src/models/nutrition.ts`
- `apps/api/test/nutrition*.test.ts`, `apps/api/test/scan*.test.ts`

## Deliverables (tests first)
1. **Seed data** (curate carefully — this table is the accuracy bottleneck): `foods.tr.json` ≈ 300 Turkish staples with per-100 g
   kcal/protein/carbs/fat (+fiber where known), `defaultServingG`, `servings` (e.g. "1 dilim", "1 kase", "1 adet"), `category`, `aliases`
   (include the 25 TurkishFoods-25 labels: `adana_kebab, baklava, borek, cig_kofte, doner, gozleme, hamsi, imam_bayildi, iskender, karniyarik,
   kofte, kumpir, kuru_fasulye, lahmacun, lokum, manti, menemen, mercimek_corbasi, pide, pilav, simit, sarma, sucuk, tavuk_sis, yaprak_sarma` —
   match snake_case labels exactly), verified true, source `seed`. `foods.food101.json`: all 101 Food-101 labels (`apple_pie … waffles`) with
   `nameTr`, per-100 g values and default grams (values from USDA SR Legacy where possible). Also ensure every label in
   `MOCK_LABELS` (`apps/api/src/modules/vision/client.ts`) resolves to a food via aliases. `seedFoods()` inserts when the collection has no
   `source: "seed"` docs; idempotent; sets `searchKey`.
2. **Search** `GET /nutrition/foods/search?q=&limit=&remote=`: local ranking (prefix on searchKey > alias exact > text score > popularity), Turkish
   folding, `limit` ≤ 30; `remote=1` → OFF search through `ctx.http` (timeout 5 s, errors swallowed → `remote: []`), normalize to `FoodDTO`
   (per-100 g from `nutriments.energy-kcal_100g` etc.), cache into `foods` with `source: "off"` + `externalId`. `GET /nutrition/foods/:id`,
   `POST /nutrition/foods` (private `ownerUserId`), `GET /nutrition/foods/barcode/:code` (local → OFF v2 product endpoint → cache).
   `GET /nutrition/recent` (last 20 distinct foods by `loggedAt`).
3. **Meal entries**: create (`foodId` or `custom`), denormalize `name/per100g`, compute `totals` with core, bump `popularity`, `PATCH` grams/meal,
   `DELETE`; return `dayTotals` after each write; `invalidateWeeklyReports` on every write.
4. **Day / week views**: `GET /nutrition/day?date=` (`NutritionDayView`, one `$group` for totals + one find for entries), `GET /nutrition/week?week=`
   (7 days keyed by the user's `measurementDay` via `weekKeyFor`; `adherence` = share of logged days within ±10 % of target).
5. **Targets**: `GET/PUT /nutrition/target` (`DietTarget` model). Auto mode: if an active `Goal` exists (read `Goal` model from
   `apps/api/src/models/goal.ts`), use `plan.roadmap[weekIndex].macros` for the current plan week (fallback `plan.macros`), `derivedFrom: "goal"`;
   else if a body entry exists → maintenance (Katch-McArdle × activity multiplier from settings) `derivedFrom: "maintenance"`; else defaults.
6. **Scan** `POST /nutrition/scan` (multipart `image`, ≤ 6 MB, jpeg/png/webp): downscale with `sharp` to max 1024 px (keep bytes in memory;
   persist to `UPLOAD_DIR/scans/<userId>/<scanId>.jpg`), call `createVisionClient(ctx).analyze()`, map labels → foods by `aliases`, filter by
   `settings.vision.minConfidence`/`maxDetections` (always keep top-1), `suggestedGrams = food.defaultServingG`, persist `Scan`, return
   `ScanResultDTO` (`imageUrl: "/api/v1/uploads/scans/<userId>/<id>.jpg"`). `VisionUnavailableError` → `503 VISION_UNAVAILABLE` with
   `details: { fallback: "search" }`. `gate === "notFood"` → `detections: []` (200). Rate limit 30/min. Serve uploads via a GET route that checks
   the requester owns the file (or admin) and streams it (`@fastify/static` or manual `reply.send(stream)`).
7. **Admin**: `GET/POST /admin/foods`, `PATCH/DELETE /admin/foods/:id`, `POST /admin/foods/import {query, source, limit}` (USDA FDC search
   `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY` and OFF, via `ctx.http`, tests use `FakeHttpClient`), `GET /admin/scans`.
   Register these with `app.requireAdmin` inside your module.

## Status (append below)
