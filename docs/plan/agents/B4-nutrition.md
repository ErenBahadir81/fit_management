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

---

### 2026-09-10 — B4 complete (core nutrition + API nutrition module)

**Green:** `pnpm --filter @fitfloow/core test` (303 tests, 63 mine) · `pnpm --filter @fitfloow/core typecheck` ·
`pnpm --filter @fitfloow/api test` (319 passed / 10 skipped, **116 mine**) · `pnpm --filter @fitfloow/api typecheck`.

#### `packages/core/src/nutrition/` (pure, 62 tests)
- `totals.ts` — `entryTotals(grams, per100g)` (kcal integer, macros 1 dp), `sumTotals`, `avgTotals`, `remaining(target, eaten)`,
  `adherence(days, targetCalories, tolerance = 0.1)` → share of **logged** days within ±10 %, `emptyTotals`.
- `search.ts` — `normalizeQuery`/`queryTokens` (core `searchKey` folding), `foodScore`, `rankFoods`. Tiers:
  exact name 100 > name prefix 80 > alias exact 70 > alias prefix 55 > word start 45 > contains 30 > text score 15;
  popularity (≤ +10) and `verified` (+2) only break ties, never jump a tier.
- `targets.ts` — `katchMcArdleBmr`, `macrosFromCalories`, `maintenanceTarget`, `autoDietTarget` (goal → maintenance → defaults),
  `pickRoadmapWeek` (clamped at both ends), `DEFAULT_DIET_TARGET`.
- `food101.ts` — `FOOD101_TR`/`FOOD101_LABELS` (101), `TURKISH25_TR`/`TURKISH25_LABELS` (25), `labelTr`, `labelToTitle`, `isFood101Label`.

#### Seed (`apps/api/src/modules/nutrition/seed/`)
- `foods.tr.json` — **317** Turkish staples, per-100 g kcal/P/C/F (+fiber where known), `defaultServingG`, TR serving presets
  ("1 dilim", "1 kase", "1 adet"…), 22 categories, aliases including **all 25 TurkishFoods-25 snake_case labels**.
- `foods.food101.json` — **101** rows, one per Food-101 class, raw label as first alias, TR name identical to core `FOOD101_TR`,
  USDA SR-Legacy-derived macros and `foodPortions`-style default grams.
- `buildSeedFoods()` merges both (Turkish rows win colliding aliases; a duplicated dish — only `baklava` today — is folded into one
  food rather than inserted twice) → **417** documents. `seedFoods(): Promise<number>` inserts only when no `source: "seed"` doc
  exists (idempotent), sets `searchKey`, `verified: true`, `externalId: "food101:<label>"`.
- `test/nutrition-seed.test.ts` audits the table: DTO bounds, **Atwater 4/4/9 balance within max(25 kcal, 25 %)** for every
  non-alcoholic row, no duplicate names, no two foods claiming an alias, and that every Food-101 label, every TurkishFoods-25 label
  and every `MOCK_LABELS` entry resolves to exactly one food.

#### Routes (all under `/api/v1`, match `02-api-contract.md` + `packages/api-client`)
`GET /nutrition/foods/search?q=&limit=≤30&remote=` · `GET /nutrition/foods/:id` · `POST /nutrition/foods` (201, private) ·
`GET /nutrition/foods/barcode/:code` · `GET /nutrition/recent` · `POST /nutrition/entries` (201) ·
`PATCH /nutrition/entries/:id` · `DELETE /nutrition/entries/:id` (204) · `GET /nutrition/day?date=` · `GET /nutrition/week?week=` ·
`GET|PUT /nutrition/target` · `POST /nutrition/scan` (multipart, 30/min) · `GET /uploads/scans/:userId/:file` ·
`GET|POST /admin/foods` · `PATCH|DELETE /admin/foods/:id` · `POST /admin/foods/import` · `GET /admin/scans` (all admin routes
registered with `app.requireAdmin` inside this module).

#### Notes for other agents
- **`apps/api/src/models/nutrition.ts`**: the `barcode` unique index is now **partial** (`{ barcode: { $type: "string" } }`), not
  sparse — every food stores `barcode: null` explicitly and sparse treated those nulls as duplicates. Duplicate barcodes surface as
  `409 CONFLICT`.
- **B1**: `seedFoods()` returns the inserted row count (`number`), which is what `seedFoodsIfAvailable` in `src/seed/index.ts`
  reports. The `"../modules/nutrition/seed/index.js"` specifier resolves to the `.ts` file under tsx/vitest.
- **B3**: `invalidateWeeklyReports(userId, [weekKey])` is called on every meal-entry create/update/delete, using the user's
  `measurementDay` via `weekKeyFor`. `entryTotals`/`sumTotals`/`remaining` in `@fitfloow/core` are yours to reuse for the home and
  weekly-report screens; `resolveTarget(ctx, userId)` is exported from `modules/nutrition/index.ts` if you need the diet target.
- **B5**: the scan pipeline honours `gate: "notFood"` (→ `detections: []`, 200) and `VisionUnavailableError`
  (→ `503 VISION_UNAVAILABLE`, `details.fallback = "search"`), and passes `modelVersion`/`mock`/`latencyMs` straight through.
  `test/scan.test.ts` exercises the real client against a `FakeHttpClient` standing in for `POST /v1/analyze`.
- `test/vision-contract.test.ts` (B5) is skipped in this environment; nothing else was red while I worked.

#### Deviations from the brief (deliberate)
1. `GET /nutrition/day` uses **one** `find` and folds day + per-meal totals in core instead of the suggested `$group` + `find`:
   the entries are loaded anyway, so a second round-trip buys nothing. `GET /nutrition/week` does use one `$group`.
2. `foods.tr.json` has 317 rows (not exactly 300) because Food-101 already covers ~25 dishes well (pizza, hamburger, omelette,
   steak, french fries…); those live only in `foods.food101.json` with Turkish names, and the Turkish table was extended with more
   Turkish dishes instead of duplicating them.
3. Local search deliberately does **not** use the `$text` index: one `$or` query (anchored `searchKey` prefix + alias `$in` +
   folded regex) covers a ≤ few-thousand-document collection, and `rankFoods` handles the ordering with Turkish folding that
   `$text` (`default_language: "none"`) cannot. The text index is left in place for other consumers; `foodScore` still accepts a
   `textScore` if a caller ever supplies one.
4. `GET /nutrition/week` averages over the **logged** days (`daysLogged` reports the rest) so a half-logged week is not halved twice.
5. `FOOD101_TR.beignets`/`.dumplings` were shortened to "Beignet"/"Dumpling" so the JSON names and the core table can be asserted
   equal.
