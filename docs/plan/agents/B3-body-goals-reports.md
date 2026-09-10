# B3 — Body, Goal engine, Weekly reports, Home composite, Mascot selection

Model: Opus (high effort). Read `COMMON.md` first. Plan docs: `03-goal-engine.md` (authoritative math), `06-weekly-report.md`,
`02-api-contract.md` (Body, Goals, Reports, Mascot), `09-mascot.md`, research `docs/research/fat-loss-science.md` (§9–10 for numbers).
Legacy: `pnpm legacy src/app/api/body/route.ts`.

## You own
- `packages/core/src/goal/**` (engine, tdee, rate, roadmap, progress, recalibration, tests)
- `packages/core/src/reports/**` (weekly report builder, ewma trend, score, highlights, tests)
- `packages/core/src/nutrition/totals.ts` is **B4's**; if you need day totals in core, accept them as input parameters.
- `apps/api/src/modules/body/**` (body entries, weigh-ins, trends, summary, goals, reports, home, mascot message)
- `apps/api/src/models/body.ts`, `goal.ts`
- `apps/api/test/body*.test.ts`, `goals*.test.ts`, `reports*.test.ts`, `home*.test.ts`

## Core deliverables (tests first — 03 §Tests lists the cases; implement every one)
- `computeGoalPlan(input: GoalEngineInput): GoalPlan` exactly per 03 (steps 1–7): lean-preserved fat-to-lose, four rate caps
  (table / absolute / Alpert×safety / relative-to-TDEE), floors, protein/fat/carb macros by leanness band, week-by-week roadmap with
  `fatFractionOfLoss`, a-priori adaptation only when no `tdeeOverride`, warnings. Deterministic. Expose helpers: `rateBandFor`, `bmrFor`,
  `tdeeFor`, `macrosFor`, `dailyTargetFor`.
- `ewmaTrend(points: {dateKey, weightKg}[], settings.ewma)` → time-aware EWMA with outlier rejection (03 §Recalibration).
- `computeGoalProgress(goal, weighIns, bodyEntries, dayIntake[], todayKey, settings)` → `GoalProgress`.
- `recalibrateTdee(...)` → `Recalibration` per 03.
- `buildWeeklyReport(ctx)` → `WeeklyReportDTO` from plain inputs (weekKey, todayKey, measurementDay, goal|null, weigh-ins, body entries,
  logs, day intake totals, planned sessions, muscles, settings, mascot catalog). Score weights 40/20/25/15. `highlights` Turkish.
- `selectMascotMessage(key, catalog, vars, seed)` using core `pickVariant`/`renderTemplate`; decision helpers `homeMascotKey(state)`,
  `reportMascotKey(report)`.

## API deliverables
- Body: entries CRUD (compute Navy server-side with `navyBodyFat`; reject invalid with `VALIDATION`; `dateKey` from `trDateKey(date)`;
  upsert a `WeighIn {source: "bodyEntry"}` for that day; on delete, remove the auto weigh-in if it still points to that day and source),
  weigh-ins (upsert per day), `GET /body/trends?days=` (merge weigh-ins + body entries into daily points, EWMA over weigh-ins),
  `GET /body/summary`. Every write → `invalidateWeeklyReports`.
- Goals: `preview`, create (`409 GOAL_EXISTS`; `400 NO_BODY_ENTRY` when no measurement), `PATCH /goals/current` (re-plan from current state,
  keep `start`), `recalibrate`, `complete`, `abandon`, `GET /goals/current` with progress. Age from `user.birthDate` when present.
  Day intake for progress/recalibration: aggregate `MealEntry` by `dateKey` (`$group` sum of `totals.kcal`, count) — read-only use of B4's model.
- Reports: `GET /reports/weekly?week=` (default current week for the user's `measurementDay`; validate `week` is a week start → if not, snap to
  `weekKeyFor`), cache in `WeeklyReportCache` (write-through; invalidated by writers), `GET /reports/weekly/history?limit=` (build missing weeks
  on demand, cap 26), `GET /reports/home` (`HomeDTO`; must be < 40 ms in tests on in-memory Mongo with ~200 docs — assert in a test),
  planned sessions per week = program cycle days with `kind !== "rest"` scaled to 7 days (`Math.round(7 × strengthDays / cycleLength)`).
- `GET /mascot/message?context=`.
- Export `buildWeeklyReportForUser(userId, weekKey)` from `apps/api/src/modules/body/reports.service.ts` (B1's admin overview imports it dynamically).

## Status (append below)

### Status — B3 (complete)

**Core (`packages/core`)** — 8 new test files, 104 tests, all green; `pnpm --filter @fitfloow/core typecheck` clean.

- `src/goal/tdee.ts` — `leannessBandFor`, `fatFractionFor`, `bmrFor` (Katch, blended with Mifflin when `birthDate` is
  known), `tdeeFor`, `macrosFor` (protein by leanness band floored per kg bodyweight, fat as a share of calories,
  carbs fill the rest with a 50 g floor).
- `src/goal/rate.ts` — `rateBandFor` (bfMax exclusive, clamps outside the table), `safeWeeklyRate` (four caps —
  table / absolute / Alpert×safety / relative-to-TDEE — smallest wins, `limitedBy` + all four `caps` returned),
  `dailyTargetFor` (floor = max(sex floor, bmr×minBmrFactor, tdee×minTdeeFactor); hitting it lowers the rate and
  raises `FLOOR_LIMITED`). The relative cap (30 % of TDEE) and the floor (70 % of TDEE) are exact complements, so the
  comparison uses a 1e-6 tolerance — otherwise every relative-limited plan would report a spurious FLOOR_LIMITED.
- `src/goal/plan.ts` — `computeGoalPlan` (steps 1–7) + `tdeeForWeek`. Deterministic; warnings
  `TARGET_ABOVE_CURRENT | TARGET_TOO_LOW | FLOOR_LIMITED | ALPERT_LIMITED | LONG_HORIZON`.
- `src/goal/ewma.ts` — `ewmaTrend` (time-aware `α_eff = 1 − (1−α)^days`, sparseAlpha under 5 weigh-ins/week,
  outlier rejection that keeps the raw point), `ewmaAt`, `ewmaChange`, `ewmaSlopePerWeek`, `latestTrendWeight`.
- `src/goal/progress.ts` — `computeGoalProgress`, `expectedAtDay`, `roadmapWeekAt`, `tdeeAtDay`.
- `src/goal/recalibrate.ts` — `recalibrateTdee` (settling window, min days, min logged days/week, sanity clamp,
  β damping, ±150 kcal/week clamp) + `isLogged`/`DayIntake`.
- `src/reports/weekly.ts` — `buildWeeklyReport`, `buildHighlights` (Turkish), `summarizeWeeklyReport`.
- `src/reports/score.ts` — `computeWeekScore`, `SCORE_WEIGHTS` (40/20/25/15).
- `src/reports/mascot.ts` — `selectMascotMessage`, `moodForScore`, `homeMascotKey`, `reportMascotKey`.

**API (`apps/api/src/modules/body`)** — `shared.ts`, `body.{service,routes}.ts`, `goals.{service,routes}.ts`,
`reports.{service,routes}.ts`, `mascot.service.ts`, `index.ts`. 4 test files, 75 tests, all green.
Routes exactly per `02-api-contract.md`: 9 body, 7 goals, 3 reports, 1 mascot. Every write calls
`invalidateWeeksFor` (drops `WeeklyReportCache`). `buildWeeklyReportForUser(userId, weekKey?, now?)` is exported from
`reports.service.ts` for B1's admin overview. `GET /reports/home` medians ~9 ms with ~200 docs (asserted < 40 ms).
Each API test file also parses its responses through the shared zod DTOs so contract drift fails loudly.

**Deliberate deviations from the plan text (all documented in code comments):**
1. *Roadmap termination.* 03 §7 uses `remainingWeightToTarget = weight − targetWeight`. With
   `fatFractionOfLoss < 1` that never converges (each kg lost also removes lean mass), producing a long tail of
   0.02 kg weeks. The loop instead solves for the loss that actually lands on the target body fat,
   `Δw = (fat − t·w/100) / (ff − t/100)`, which collapses to the plan's formula when `ff = 1` and terminates exactly.
2. *On-track comparison.* 03 compares the EWMA trend against the plan's raw expected weight. The trend structurally
   lags a falling weight by ~1/α days (≈ 1 kg at α 0.1), i.e. far more than the 0.4 kg threshold, so every dieter
   would read "behind" forever. `computeGoalProgress` pushes the plan's expected trajectory through the *same* EWMA
   (same dates, gaps and alpha) and compares trend to trend. `expectedWeightKg` in the DTO is still the plain roadmap
   value for the chart.
3. *Score without a goal.* With no goal there is no deficit target, so the 40-point weight is redistributed over
   logging/training/weigh-ins (weights still sum to 100) instead of capping such users at 60.
4. *Re-planning.* `PATCH /goals/current` and a successful recalibration re-simulate the roadmap from *today* with the
   current measurement; `goal.start` is preserved. Progress therefore keys elapsed time and banked deficit off
   `goal.start.dateKey` but the roadmap off `plan.startKey` (identical for a fresh goal).
5. `settings.goal` has no `leanLossFraction`; `fatFractionOfLoss` plays that role, and `plan.totalLossKg` is the
   simulated total weight loss (> `fatToLoseKg` for lean dieters), while `targetWeightKg` stays the lean-preserved value.

**Notes for other agents**
- `GET /body/trends` emits one point per day that has data (sparse), not a dense 90-day axis.
- `home.recovery` uses B2's `computeRecovery` from `@fitfloow/core/training` and returns the three *least* recovered
  muscles in `top` (a local stand-in was used while B2 was landing; it is deleted).
- Home's calorie/protein target: manual `DietTarget` wins, else the current roadmap week, else the stored auto target.
  B4 owns `DietTarget`/`MealEntry`; this module only reads them (`MealEntry` via one `$group` per request).
- Streaks: consecutive days back from today (today may be missing without breaking the streak) with any workout log /
  any meal entry / any weigh-in.
- Whole-repo state at hand-off: `@fitfloow/core` 25 files / 302 tests green, `@fitfloow/api` 319 passed with
  `test/vision-contract.test.ts` skipped by its owner (B5). No red tests owned by others.
