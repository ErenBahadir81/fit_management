# F3 — Mobile: Nutrition feature (day log, search, barcode, AI scan with camera + "AI thinking" theatre, week view, targets)

Model: Opus (high effort). Read `COMMON.md`, then **`apps/mobile/src/ui/README.md`** (component catalog by F4a — use it), `07-mobile-app.md`
§Screens 6–7 + design system, `05-nutrition-vision.md` (esp. §Mobile scan UX), `02-api-contract.md` (Nutrition), `packages/core/src/schemas/nutrition.ts`,
`packages/core/src/nutrition/` (totals helpers, if present), `packages/api-client/src/index.ts` (nutrition), `apps/mobile/src/lib/api.ts` + `fake/`.

## You own
- `apps/mobile/src/features/nutrition/**`, routes `apps/mobile/app/(tabs)/nutrition.tsx` (replace placeholder) and `apps/mobile/app/(modals)/scan/**`
  (check the modal group in `app/_layout.tsx`), tests under `apps/mobile/src/features/nutrition/**/*.test.tsx`.
- Extend `apps/mobile/src/lib/fake/` with nutrition fixtures (day view, foods, scan result) — add files only.

## Screens
1. **Day**: date header with horizontal day pager (swipe, today pill, dots for logged days), Calorie ring (eaten/target/remaining, color shifts
   near/over target) + macro bars (protein/carbs/fat), meal sections (Kahvaltı/Öğle/Akşam/Ara öğün) with entries (name, grams, kcal; tap → edit
   grams sheet with stepper ±10 g and long-press acceleration; swipe → delete with undo), per-meal "+" and a FAB "+" opening an action sheet:
   **Tara (kamera)** / **Ara** / **Son kullanılanlar** / **Barkod** / **Elle gir**. Week tab (segmented "Gün | Hafta"): 7 bars vs target line,
   avg, adherence chip. Target sheet: auto (from goal) vs manual with fields.
2. **Search sheet**: debounced local search (300 ms), results list (FlashList) with per-100 g kcal and quick-add serving chips ("1 dilim 30 g"),
   grams stepper before adding, "İnternette ara" toggle for remote OFF results, custom food form (name + per-100 g), recent foods first when the
   query is empty. Barcode: expo-camera barcode scanning (EAN-13/8, UPC) → `nutrition.barcode` → result card.
3. **Scan (full-screen modal)**: expo-camera preview with framing guide + shutter (haptic) + gallery pick (expo-image-picker); after capture show
   the still with the **AI theatre overlay**: sweeping gradient scan line (reanimated loop), pulsing corner brackets, floating particles,
   status label cycling "Görüntü analiz ediliyor… → Yemekler tanınıyor… → Besin değerleri hesaplanıyor…" (each ≥ 600 ms; overall minimum 1.8 s even
   if the API answers faster; if it takes longer, keep looping), Floo small "think" mood in the corner. Then results bottom sheet: detection cards
   (name TR, confidence chip, editable grams with live kcal/macros, remove), "Başka bir yemek ekle" → search, meal picker (defaults by time of day),
   "Öğüne ekle" → `nutrition.addEntry` for each kept detection with `source: "scan"`, `scanId`; success haptic + Floo "scan.done"; day view
   updates optimistically. States: `mock: true` → subtle "Demo modu" chip; `detections: []` (not food) → friendly message + search CTA;
   `503 VISION_UNAVAILABLE` → fallback to search with an explanation. Never a crash, never a raw error.
4. Tests: totals/remaining math via core, search debounce hook, scan state machine (pure reducer: capturing → analyzing(minDuration) → results →
   saving → done/error), day screen renders skeleton then fixture content, grams stepper.

## Rules
- Query keys `["nutrition-day", dateKey]`, `["nutrition-week", weekKey]`, `["foods", q]`, `["nutrition-target"]`; optimistic add/edit/delete
  with rollback; invalidate `["home"]` after writes.
- Keep `pnpm --filter @fitfloow/mobile typecheck`, `test`, `export:web` green. Camera modules are native-only: guard with `Platform.OS !== "web"`
  and a graceful web fallback (image picker only) so `export:web` still bundles.

## Status (append below)

### F3 — nutrition delivered (2026-09-10)

**Gates**: `pnpm --filter @fitfloow/mobile typecheck` clean · `test` → 46 suites / 319 tests green (mine: 6 suites / 56 tests) ·
`export:web` succeeded twice. No device here — camera/haptics/gestures verified only through mocks and the web bundle.

**Routes**: `app/(tabs)/nutrition.tsx` → `features/nutrition/NutritionScreen`; `app/(modals)/scan.tsx` → `features/nutrition/scan/ScanScreen`
(kept as a single route file — a `scan/` directory would have collided with the existing `scan.tsx`). Scan is opened with
`router.push({ pathname: "/(modals)/scan", params: { date, meal } })`.

**Day tab** (`NutritionScreen`, `components/*`): header + `Segmented` Gün|Hafta + "Bugün" pill; `DayPager` (horizontal snap strip,
swipe or tap, `contentOffset` starts on today, dots for logged days, selection haptic); `Reveal` → `NutritionSkeleton` (mirrors the real
heights) → FlashList of flattened rows (`buildDayRows`: meal header · entries · add) with the `CalorieHero` (ring + 3 macro bars, tone
shifts near/over target) as the list header; entries tap → `GramsSheet` (±10 g stepper with hold-to-repeat, live macros, meal move, delete),
swipe-left → `SwipeToDelete` (own worklet pan gesture, UI thread) → optimistic delete + `UndoBar` (5 s, restores with the same food/grams);
per-meal "+" and a gradient FAB → `AddSheet` (Tara / Ara / Son kullanılanlar / Barkod / Elle gir); pull-to-refresh.

**Week tab** (`WeekView`): `BarWeek` 7 bars vs the dashed target, adherence chip (`adherencePct` accepts 0..1 and 0..100), average kcal,
days-logged tile, average macros.

**Sheets** (`sheets/*`): `SearchSheet` (300 ms debounced search via `useDebouncedValue`, FlashList over gorhom's scrollable, recents when the
box is empty, per-100 g kcal + quick-add serving chips, "İnternette ara" remote toggle, `FoodDetail` step with serving chips/stepper/live
macros/meal picker, `CustomFoodForm` "Elle gir" with tr-TR comma parsing and validation); `BarcodeScanner` (full-screen modal, expo-camera
EAN-13/8 + UPC, found → `FoodDetail`, unknown → manual-entry CTA, web/no-permission → explained fallback); `TargetSheet` (auto vs manual macros).

**Scan** (`scan/*`): pure `scanMachine` reducer (camera → capturing → analyzing → results → saving → done/error) with `MIN_ANALYZE_MS = 1800`
and a 600 ms status cadence, out-of-order answers parked until the theatre finishes, `mapScanError` (503 `VISION_UNAVAILABLE` → "ara"
fallback, 0 → offline, 413 → too large), empty detections → friendly `notFood`, adding a searched food rescues the error state.
`AiThinking` renders the still under a sweeping gradient line, pulsing corner brackets, drifting particles, the cycling status pill and Floo
in "think" — all reanimated worklets, reduced-motion aware. `ScanResults` = detection cards (confidence chip, ±10 g stepper, live kcal/macros,
remove), "Başka bir yemek ekle" → search, meal picker (defaults by clock), "Öğüne ekle" → one `addEntry` per item with `source:"scan"` +
`scanId`, success haptic + `SuccessCheck`/Floo cheer, then `router.back()`. `mock: true` → "Demo modu" chip.

**Data** (`useNutrition.ts`): keys `["nutrition-day",dateKey]`, `["nutrition-week",weekKey]`, `["foods",q]`(+`"remote"`),
`["nutrition-target"]`, `["nutrition-recent"]`; optimistic add/add-many/update/delete with snapshot rollback + error toast; every write
invalidates day, week, recents and `["home"]`. Day maths (`model/day.ts`) is built on core's `entryTotals`/`sumTotals`/`remaining` so the
client can never drift from the API.

**Fake** (added, nothing rewritten): `src/lib/fake/nutritionFake.ts` — 24 extra Turkish foods (3 packaged with EAN-13 barcodes),
`installNutritionFixtures` (seeds the running fake state; called lazily from `useNutritionDay` when `EXPO_PUBLIC_API_FAKE=1`),
`findByBarcode`, `fakeScanResult` (plate / single / notFood, always `mock: true`) and `createNutritionFakeApi({scanScenario, scanFails})`
used by the screen tests. The base fake's barcode route still answers `null`, so demo mode resolves barcodes from the seeded fixtures.

**Tests**: `model/scanMachine.test.ts` (13 cases: min duration, slow/fast API, status cadence, notFood, 503, grams/remove/add, save, retake,
late events), `model/day.test.ts` (totals, optimistic cache transforms, ring tone, macro rows, meal-by-clock), `components/dayRows.test.ts`
(row builder, adherence, custom-food validation), `useFoodSearch.test.tsx` (debounce: one request per pause, quiet under 2 chars, remote flag),
`NutritionScreen.test.tsx` (13: skeleton→content, warm cache, FAB→scan route, search→add with optimistic totals, edit grams, delete+undo,
manual entry, barcode found/unknown, target sheet, day pager, week tab, error retry, failed-add rollback), `scan/ScanScreen.test.tsx`
(6: theatre ≥1.8 s, grams edits, save→entries+back, notFood, vision outage→search rescue, gallery route).

**Gotchas worth knowing (F2 / F4b / F4c)**
- **react-query mutation GC keeps jest alive**: `makeQueryClient()` in `__tests__/helpers.tsx` sets `gcTime` only for queries, so every
  finished mutation leaves a 5-minute timer and `jest --ci` hangs after the suite passes. My screen tests build a local client with
  `mutations: { gcTime: 0 }` — consider adding that to the shared helper.
- FlashList v2 *calls* `renderScrollComponent(props)`, so a class/forwardRef (e.g. `BottomSheetScrollView`) must be wrapped in a plain
  function component; `estimatedItemSize` no longer exists.
- RNGH's `ReanimatedSwipeable` logs a worklet warning per render with JS callbacks; replaced by `components/SwipeToDelete.tsx` (pan gesture
  with `runOnJS` only at the end).
- `FlatList` + `initialScrollIndex` renders nothing under jest (no layout events) — use `contentOffset`.
- `api.nutrition.scan()` needs RN's FormData; jsdom's rejects `{uri,name,type}` (the scan test stubs it).
- Known noise: the full mobile run prints "A worker process has failed to exit gracefully"; it does not reproduce with the nutrition suites
  alone (`--detectOpenHandles` finds nothing there) and no test fails.

**Gaps**: camera framing/exposure, gorhom keyboard behaviour in the search sheet and the pager's snap feel need a device pass (F4c);
`nutrition.createFood` is wired (`useCreateFood`) but the "Elle gir" flow only logs the entry — saving custom foods to the user catalog is a
follow-up; OFF remote results are rendered but the fake returns none.
