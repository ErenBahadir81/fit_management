# F4b — Mobile: Body measurements, Goal setup & roadmap, Weekly report (Fable 5.1)

Read `COMMON.md`, your own `apps/mobile/src/ui/README.md`, `07-mobile-app.md` §Screens 8–10, `03-goal-engine.md`, `06-weekly-report.md`,
`09-mascot.md`, `02-api-contract.md` (Body, Goals, Reports), `packages/core/src/schemas/{body,goal,report}.ts`, `packages/core/src/{navy,goal,reports}/`
(client-side live previews: Navy from core; goal preview via API `goals.preview` with a debounced call, or core `computeGoalPlan` if exported —
prefer core for instant feedback and call the API for the authoritative plan).

## You own
- `apps/mobile/src/features/{body,goals,reports}/**`, route `apps/mobile/app/(tabs)/body.tsx` (replace placeholder), nested routes for
  goal setup/roadmap and weekly report (e.g. `app/(modals)/goal/**`, `app/report/[week].tsx` — follow the structure you defined in F4a),
  tests alongside. Extend `src/lib/fake/` with body/goal/report fixtures.

## Screens (this is the product's report heart — make it exceptional)
1. **Body**: hero card (EWMA weight big numeral with ±7 d delta, bf % pill with ±3.5 uncertainty hint, lean mass, waist), inline **quick weigh-in**
   (stepper prefilled with last weight, one tap "Kaydet", haptic, optimistic point on the chart), trends chart (segmented 30/90/180/365; raw dots
   faded, EWMA line, goal target line dashed when a goal exists; scrub with haptic ticks and a floating value label), measurement history
   (FlashList, swipe delete), "Ölçüm ekle" sheet: gender/height prefilled, neck/waist/(hip) with steppers + numeric input, live Navy preview
   (bf %, fat kg, lean kg, category) and validation copy (bel > boyun), save → success.
2. **Goal setup**: current bf pill → target slider (0.5 steps, min = safe floor by sex, snapping haptics) → profile segmented (Temkinli/Optimal/Agresif
   with one-line explanations) → live preview card (fat to lose kg, weeks, daily kcal, target date, warnings as inline chips) → "Hedefi başlat"
   (Floo `goal.created` cheer). **Roadmap**: header progress (percent ring, kg to go, on-track chip colored, projected date), chart expected vs
   actual EWMA, week list (FlashList: week n, dates, planned kcal/day, deficit, expected weight; current week highlighted; past weeks show actual
   vs expected delta), "Yeniden kalibre et" with an explainer sheet showing the recalibration result, edit target / abandon in an overflow menu.
3. **Weekly report** (`/reports/weekly`): hero with score ring + Floo message (mood from report), deficit card ("Bu hafta {kcal} kcal ekside kaldın ≈
   {kg} kg yağ" with per-day bars vs planned line, logged/unlogged days distinguishable), body card (EWMA delta vs expected, bf/waist start→end),
   training card (sessions/planned, volume vs targets mini-matrix), goal distance card, highlights list, week switcher (‹ › with measurement-day
   labels; current week live badge), history carousel (last 12 weeks score sparkline). Report screen must feel like a designed magazine page,
   not a table.
4. Tests: Navy preview math, slider clamping, goal preview debounce hook with fake client, report screen renders with fixture (score ring value,
   mascot text), weigh-in optimistic update.

Keep typecheck/tests/export:web green. Append Status to this file.

## Status (append below)

### F4b — body, goals & weekly report delivered (2026-09-10)
**Gates**: `pnpm --filter @fitfloow/mobile typecheck` clean · my 11 suites green (fake domain, body math/form/screen, goal math/preview-hook/screens, report math/count-up/screen, smoke) — `pnpm --filter @fitfloow/mobile test` → 43/46 suites, 285/294 tests (19,8 s); the 3 red suites are F2/F3 work in progress under `src/features/{training,nutrition}` · `export:web` succeeded twice (5.3 MB bundle incl. F2/F3 code, `dist-web/` gitignored).

**Routes** (all inside the already-protected groups, no `_layout` edits): `(tabs)/body` → `BodyScreen`; `(modals)/goal/setup?mode=edit` → `GoalSetupScreen`; `(modals)/goal/roadmap` → `RoadmapScreen`; `(modals)/report/[week]` (`current` or any date inside the week) → `WeeklyReportScreen`. Home's goal card / weigh-in nudge already land on the body tab; the body tab links into goal + report.

**Body tab** (`features/body`): one FlashList (header = cards, rows = measurements) with `Reveal` + `BodySkeleton` (`BODY_HEIGHTS`). Hero: EWMA weight as a rolling numeral (`CountUp`), 7-day delta with tone, category chip, bf pill with the ±3,5 uncertainty hint, lean mass, waist. Quick weigh-in: stepper prefilled (last weigh-in → trend → entry), one tap "Kaydet"/"Güncelle" → optimistic patch of `["body","summary"]` and every cached trend range (client EWMA continuation, `bodyMath.optimisticTrends`), success haptic + 1,8 s "Kaydedildi", rollback + error toast. Trends card: 30/90/180/365 segmented, `LineTrend` (EWMA line, faded raw dots, dashed goal target weight when a goal exists, scrub ticks), 30-day kilo/yağ/bel deltas. Goal + report entry cards (ring mini-progress, on-track chip / live score). History rows: swipe-left delete (`ReanimatedSwipeable`) + a11y "Sil" action, optimistic removal with rollback. "Ölçüm ekle" sheet: gender segmented + height prefilled, neck/waist/(hip for women)/weight steppers with a comma-tolerant numeric input each, live Navy preview (bf ±3,5, category chip, fat/lean kg), validation copy (`Bel çevresi boyundan büyük olmalı`, `Kalça ölçüsü gerekli`, schema bounds), save → `SuccessCheck`. Content mounts on present.

**Goals** (`features/goals`): `goalMath` (essential-floor/current−0,5 bounds, 0,5 snapping, default target −5 pts, `instantPlan` = core `computeGoalPlan` with default admin settings + the user's age, `roadmapRows`, `planChartRows`). `useGoalPreview` debounces 350 ms and keeps the previous server answer (`keepPreviousData`); the screen shows the instant plan and swaps in the API plan when it matches the current input (`preview-status`: pulsing "hesaplanıyor" → "plan doğrulandı"). Setup: "Şu an" row, target card with the big value + `TargetSlider` (UI-thread pan, snapping tick per 0,5 step, floating value label, adjustable role with increment/decrement), pace segmented with one-line hints, `PreviewCard` (primary gradient: fat kg count-up, weeks, kcal/day, target date, rate + protein) + warning chips, "Hedefi başlat" (disabled when unreachable / below the floor) → success view (SuccessCheck, Floo cheer with `goal.created` from `/mascot/message?context=goal`) → roadmap; `mode=edit` preloads and PATCHes. Roadmap: header card (percent ring count-up, kg to go, on-track chip, projected date, trend vs expected vs diff), `PlanTrendChart` (dashed plan, solid actual EWMA, faded weigh-ins, target line, today marker, scrub), recalibration card → `RecalibrateSheet` (explainer + formula/observed/used TDEE, window, intake, trend delta, applied/reason), FlashList of plan weeks (current highlighted with "Bu hafta", past weeks show actual vs expected delta), overflow sheet (edit / complete / two-step abandon).

**Weekly report** (`features/reports`): `WeeklyReportScreen` = header + `WeekSwitcher` (‹ ›, "6 Eyl – 12 Eyl", measurement-day label, "Canlı" badge; no › past the live week) + `Reveal`/`ReportSkeleton` (`REPORT_HEIGHTS`). Cards: `ScoreHero` (132 pt ring toned by band, score count-up, score word, Floo in the report's mood + `SpeechBubble` with the server line), `DeficitCard` ("Bu hafta 3.200 kcal ekside kaldın ≈ 0,42 kg yağ" / honest over-target copy, `DeficitBars`: signed bars around a zero baseline, dotted = unlogged, faint = future, today outlined, dashed planned-per-day line; planned/realised/logged footer), `BodyReportCard` (trend delta vs expected with tone, bf/waist/scale start→end, weigh-in days), `TrainingCard` (sessions/planned ring, sets, cardio, volume mini-matrix with min tick and status tones), `GoalDistanceCard` (kg + points to go, progress bar, plan vs projected weeks, date; CTA when no goal), `Highlights`, `HistoryCarousel` (12-week score sparkline + tappable tiles). Week switching keeps the previous page dimmed (`keepPreviousData`) instead of flashing a skeleton. `CountUp` (`reports/components`, shared): UI-thread timing, JS re-render only when a visible digit changes, reduced motion → final value, a11y label always final.

**Fake API** (`src/lib/fake/domain.ts`, additive wiring in `fakeFetch.ts`): goal plan/preview/create/PATCH/recalibrate now run core `computeGoalPlan` / `recalibrateTdee` (seeded goal: %15, temkinli, started 4 weeks ago → "Rotada"), progress = `computeGoalProgress`, weekly reports + 12-week history = core `buildWeeklyReport` (real highlights, score, Floo line; planned sessions derived from the program). Old `fx.makePlan/makeGoal/makeProgress/makeWeeklyReport` stay exported but unused.

**Tests added** (`__tests__/features/{body,goals,reports}`, `__tests__/lib/fakeDomain.test.ts`, `__tests__/mocks/{flashList,swipeable}`): Navy preview math + validation, optimistic trend/summary patches, measurement form (live preview follows inputs, waist ≤ neck copy + disabled save, 0,5 steps + clamps, female hip, gender switch), body screen (skeleton → hero, warm cache, optimistic weigh-in before the slow server answers + persist + haptic, rollback toast, a11y delete, links, no-goal CTA), goal math (bounds/snapping/default/instant plan/roadmap + chart rows), debounced preview hook with a fake client (one call per settled input, previous numbers kept), goal screens (default target, a11y snapping, pace changes preview, create → cheer → roadmap, edit PATCH keeps start, no-measurement state, roadmap ring/chip/chart/rows, recalibration sheet, overflow abandon), report math (bands, bars, sentence, adjacent weeks, history order), count-up roll, report screen (score ring value + count-up label, mascot text, deficit sentence, cards, highlights, 12 history tiles, ‹ › switching, tile jump, deep link, goal CTA routing). FlashList v2 renders rows in Jest only with the measurement mock (its shipped `jestSetup.js` references a `RecyclerView` export that 2.0.2 no longer has) — see `__tests__/mocks/flashList.ts`.

**Known gaps / notes**
- Not run on a device here: verify the slider's pan `e.x` origin inside the card, Skia sizing of `PlanTrendChart`, and gorhom keyboard behaviour with the measurement inputs in the F4c polish pass.
- Screen tests leave a few animation timers behind (reanimated mock frames / FlashList), so multi-worker Jest logs "worker failed to exit gracefully" and force-exits — tests still pass and `--detectOpenHandles` reports nothing. Worth a look if CI time matters.
- `useMascot("goal")` on the success view issues one extra request; fine (cached 5 min).
- `__tests__/smoke.test.tsx` now renders the real body tab (F2 replaced the program placeholder it used to assert on).
