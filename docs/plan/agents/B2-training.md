# B2 — Training & Recovery (core + API)

Model: Opus (high effort). Read `COMMON.md` first. Plan docs: `04-training-recovery.md`, `02-api-contract.md` (Training), `01-data-model.md`.
Legacy reference (port faithfully): `pnpm legacy src/lib/services/fatigue.ts`, `pnpm legacy src/app/api/_lib/program-util.ts`,
`pnpm legacy src/app/api/program/route.ts`, `.../program/complete/route.ts`, `.../program/skip/route.ts`, `.../workouts/route.ts`,
`.../recovery/route.ts`, `pnpm legacy src/lib/program-data.ts`.

## You own
- `packages/core/src/training/**` (create: `recovery.ts`, `volume.ts`, `schedule.ts`, `program.ts`, `cardio.ts`, tests; export all from `index.ts`)
- `apps/api/src/modules/training/**`
- `apps/api/src/models/workoutLog.ts` and the `Program` half of `program.ts`
- `apps/api/test/training*.test.ts`

## Deliverables (tests first)
### Core (pure, deterministic `now`)
- `recoveredFraction`, `computeReadiness(hits, muscles: MuscleDTO[], now)`, `buildHits(logs)` with **load-weighted** sets (`sets × load`),
  skip off-days / skipped / `metric: "stretch"`. Status thresholds `<40 fatigued`, `<85 recovering`. `overall` = mean readiness + counts.
  Output must match `zMuscleReadiness` (include `short`, `color`, `weeklyTarget`, `weeklySets` = sets in last 7 days).
- `weeklyVolume(logs, muscles, now)` → `MuscleVolume[]` (`status`: under/in/over/none) and `templateVolume(days)` → `Record<key, sets>`.
- `buildSchedule(program, logsThisWeek, todayKey)` → 7 `ScheduleEntry` (today + 6 days): maps cycle days forward from `currentIndex`,
  marks today `done` if today's log exists (`status: "done"`), `skipped` for off-day logs, `today`, `upcoming`.
  Past days in the same week from logs (`dateKey` → `done|skipped|past`). Cycle wraps (`% days.length`).
- `advancePointer`, `jumpTo`, `nextCardioTarget(target, entry)` (best pace × km, never worse than current), `normalizeProgramInput(days, catalog)`:
  fills `muscles` from the exercise catalog by name (case-insensitive) when omitted, defaults `metric` from catalog, validates orders 1..N.
- Port v1 numeric expectations as tests: seed program weekly sets chest 17, frontDelt 9, sideDelt 6, traps 9, lats 10, abs 6, legs 14
  (use `EREN_DAYS` from `apps/api/src/seed/data/templates.ts` copied into the core test as a fixture, or re-declare).

### API (`apps/api/src/modules/training/index.ts` registers routes)
- `GET /program` composite (`ProgramView`): program (auto-create from the first seed template if the user has none? **No** — return `404 NOT_FOUND`
  code with message "Program yok"; B1's assign-program / seed creates programs), today's log, schedule, weekly volume (logs last 7 days).
- `PUT /program`, `POST /program/jump`, `POST /program/complete` (resolves muscles from catalog, stores `pointerBefore`, advances pointer,
  updates cardio targets in the program template day for next time, week wrap → `weekNumber++`), `POST /program/skip` (idempotent per day:
  second call returns the existing off-day log, 200), `POST /program/undo-last` (only today's latest log; restores pointer; 404 otherwise).
- `GET /workouts` (newest first, `from/to` on `dateKey`, `limit` ≤ 100, `before` cursor = log id), `GET/PATCH/DELETE /workouts/:id`.
- `GET /recovery` (logs within `max(fullRecoveryHours)` hours), `GET /training/stats?weeks=` (buckets by `weekKeyFor(dateKey, user.measurementDay)`).
- After every log write/delete call `invalidateWeeklyReports(userId, [weekKeyFor(dateKey, measurementDay)])` from `apps/api/src/models/goal.ts`.
- Muscles come from `listActiveMuscles()` (`apps/api/src/models/muscle.ts`) — never hardcode.

## Status (append below)
