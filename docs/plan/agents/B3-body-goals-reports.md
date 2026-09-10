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
