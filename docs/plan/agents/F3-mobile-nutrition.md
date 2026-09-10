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
