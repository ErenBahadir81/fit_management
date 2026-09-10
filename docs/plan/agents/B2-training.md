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

### B2 status — 2026-09-10 (Opus, high effort, TDD)

**Done. `pnpm --filter @fitfloow/core test|typecheck` and `pnpm --filter @fitfloow/api test|typecheck` are green.**

#### Core — `packages/core/src/training/` (94 tests in 7 files + B1's `templateVolume.test.ts`)
| file | exports |
|---|---|
| `types.ts` | `WorkoutLogLike`, `StrengthEntryLike`, `CardioEntryLike`, `ProgramLike`, `HOUR_MS`, `WEEK_MS`, `toMs`, `normalizeMuscleLoads` — duck-typed views so DTOs *and* lean Mongo docs work with no mapping layer |
| `recovery.ts` | `recoveredFraction` (v1 curve 0 → 70 % → 100 %), `recoveryStatusOf` (<40 / <85), `buildHits`, `effectiveSets`, `computeReadiness(hits, muscles, now)`, `overallReadiness`, `computeRecovery(logs, muscles, now) → RecoveryView`, `RECOVERY_STATUS_TR` |
| `volume.ts` | `weeklyVolume(logs, muscles, now) → MuscleVolume[]`, `setsByMuscle`, `volumeStatus`, `templateVolume(days)` |
| `schedule.ts` | `buildSchedule(program, logs, todayKey, {count, daysBefore}) → ScheduleEntry[]`, `logsByDateKey` |
| `program.ts` | `normalizeIndex`, `advancePointer`, `rewindPointer`, `jumpTo`, `isValidIndex`, `currentDay`, `catalogIndex`, `normalizeProgramInput(days, catalog) → {days, errors}` |
| `cardio.ts` | `bestPace`, `cardioTotals`, `buildCardioEntry`, `nextCardioTarget` |
| `stats.ts` | `buildTrainingStats({logs, muscles, weeks, measurementDay, todayKey}) → TrainingStats`, `workoutStreak`, `loggedSets` |
| `fixtures.ts` | test-only `TEST_MUSCLES`, `EREN_DAYS`, `INCI_DAYS` (not exported from `index.ts`) |

- Everything is load weighted: a hit carries `{sets, load}` and contributes `sets × load`; with the seeded
  load-1.0 catalog every v1 number is reproduced (`templateVolume(EREN_DAYS)` = chest 17, frontDelt 9,
  sideDelt 6, traps 9, lats 10, abs 6, legs 14 — asserted).
- `contract.test.ts` parses every engine output through the zod DTOs (`zMuscleReadiness`, `zMuscleVolume`,
  `zScheduleEntry`, `zRecoveryView`, `zTrainingStats`) so the schemas stay the contract.
- `index.ts` re-exports all of the above **plus** B1's pre-existing `templateVolume.ts` (untouched;
  `templateVolume()` delegates to their `templateWeeklyVolume()` after dropping `metric: "stretch"` work).

#### API — `apps/api/src/modules/training/` (49 integration tests in 3 files)
`index.ts` registers `program.routes.ts`, `workouts.routes.ts`, `recovery.routes.ts`; `service.ts` holds the
shared loaders (program, catalog, measurement day, week invalidation, entry building).

| route | notes |
|---|---|
| `GET /program` | composite `ProgramView`; 3 queries (program, active muscles, last 7 days of logs). `404 NOT_FOUND "Program yok"` when the user has none — never auto-creates. Empty `days` → `409 CONFLICT`. Out-of-range pointers are repaired on read. |
| `PUT /program` | `normalizeProgramInput` + catalog; core errors → `400 VALIDATION` (details carry every message); pointer re-clamped to the new cycle length. |
| `POST /program/jump` | index outside `0..N-1` → `400 VALIDATION`; week untouched. |
| `POST /program/complete` | muscles resolved payload → catalog → planned day; stores `pointerBefore`; advances pointer (`weekNumber++` on wrap); progresses that day's run/swim `targetMin`; re-completing the same day edits in place (no second advance); replaces an existing rest log. |
| `POST /program/skip` | off-day log (`title: "Dinlenme"`, `notes` = reason), pointer untouched, idempotent per TR day (2nd call → same log, 200); already completed → `409 CONFLICT`. |
| `POST /program/undo-last` | only today's newest log; deletes it and rewinds the pointer (and `weekNumber` when the undone session closed the cycle); a skipped day leaves the pointer alone. Otherwise `404`. |
| `GET /workouts` | newest first, `from`/`to` on `dateKey`, `limit` 1..100 (default 30), `before` = log id cursor (invalid → `400`). |
| `GET/PATCH/DELETE /workouts/:id` | PATCH never touches pointer/week/cardio targets; rest days are not editable (`400`); DELETE → 204. |
| `GET /recovery` | `RecoveryView` from `listActiveMuscles()` (no hardcoded list; deactivated muscles disappear, newly activated ones appear). |
| `GET /training/stats?weeks=` | buckets by `weekKeyFor(dateKey, user.measurementDay)`, oldest → newest. |

- Every log write/delete calls `invalidateWeeklyReports(userId, [weekKeyFor(dateKey, measurementDay)])`.
- All time handling goes through core TR helpers and `ctx.now()` (tests drive `t.clock.now`).

#### Deviations / decisions (orchestrator, please read)
1. **`weeklyVolume` is an array** (`MuscleVolume[]`, per `zProgramView`), not the `Record<key, {done,target}>` shown in
   the 02-api-contract table. The zod schema won.
2. **`GET /training/stats` has no `prs`** — `zTrainingStats` does not define it. `totalSessions` is an all-time
   `countDocuments` (a second, index-covered query on the same collection); `weeks[]` is oldest-first.
3. **`GET /recovery` window** is `max(7 days, max(fullRecoveryHours))`, not just `max(fullRecoveryHours)`:
   `weeklySets` in `zMuscleReadiness` needs a full week of logs.
4. **`volumeStatus` semantics aligned with F1's `apps/admin/src/lib/volume.ts`**: `none` = nothing done yet;
   a muscle with only a `max` is `in` for any volume up to the ceiling. If the orchestrator prefers "max is the
   goal" (v1's `9/15 set` display), only `volumeStatus` in `volume.ts` changes.
5. `advancePointer`/`rewindPointer` derive the week roll-back from `pointerBefore === days.length - 1`, so no new
   field was added to `workoutLog.ts` (models were not modified at all).
6. `PATCH /workouts/:id` resolves muscles from the catalog only (no program day context) — matches v1's
   "editing a past session never touches the pointer".

#### Known gaps / not mine
- No `assign-program` here: B1 creates programs (`POST /admin/users/:id/assign-program`) — `GET /program` 404s until then.
- `apps/admin/src/lib/volume.ts` (F1) duplicates cycle-volume maths that now lives in core; worth collapsing onto
  `templateVolume`/`volumeStatus` in a cleanup pass.
- No blocking red tests from other agents were seen at hand-off (core 302 ✓, api 127 ✓ / 10 skipped in B5's suite).
