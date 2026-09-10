# F2 — Mobile: Training feature (program, workout logger, recovery, history)

Model: Opus (high effort). Read `COMMON.md`, then **`apps/mobile/src/ui/README.md`** (component catalog written by F4a — use these primitives,
do not invent parallel ones), `07-mobile-app.md` §Screens 3–5 and the design system section, `04-training-recovery.md`, `02-api-contract.md`
(Training), `packages/core/src/schemas/program.ts`, `packages/api-client/src/index.ts` (training), `apps/mobile/src/lib/api.ts` + `fake/`.

## You own
- `apps/mobile/src/features/training/**`, routes `apps/mobile/app/(tabs)/program.tsx` (replace the placeholder F4a left) and
  `apps/mobile/app/(modals)/workout/**` (or the modal group F4a defined — check `app/_layout.tsx`), tests under `apps/mobile/src/features/training/**/*.test.tsx`.
- Extend `apps/mobile/src/lib/fake/` with training fixtures (program view, logs, recovery) — add files, don't rewrite F4a's.

## Screens (spec in 07; highlights)
1. **Program**: WeekStrip (7 days, today pill, done/skipped/upcoming states with tiny status dots), CurrentDayCard (title/focus/exercises with
   target chips, run/swim targets), actions: "Antrenmana başla" (primary), "Atla" (secondary, confirm sheet with reason), "Buradan devam et"
   (jump sheet listing cycle days), weekly volume mini-bars per muscle vs target (under/in/over colors), history list (FlashList, grouped by week,
   tap → log detail sheet with sets and muscle chips; swipe-to-delete with undo toast). Editor sheet: reorder days (drag handle via gesture-handler),
   add/remove exercises from the catalog with search (`catalog.exercises`), edit targets with steppers; saves via `training.updateProgram`
   with optimistic cache update.
2. **Workout logger (full-screen modal)**: one exercise per pane, horizontal swipe (pager) between exercises, header progress (sets done/total,
   elapsed timer), set rows with big +/- steppers for reps (or seconds for `metric: "time"`) and RIR, "Seti tamamla" (haptic success, next set
   auto-focus), rest timer chip (90 s default, tap to skip; pulsing ring), skip exercise, add ad-hoc exercise (search sheet), cardio pane with
   segment list (km/min) and pace; finish sheet: summary (sets, volume, muscle loads chips, duration), optional RPE + note, "Bitir" → `training.complete`
   with optimistic program pointer advance and query invalidations (`program`, `recovery`, `home`), then success state with Floo cheer line.
   Persist in-progress workout to MMKV so a crash/relaunch restores it.
3. **Recovery**: grid of muscle cards (ring readiness, status color, hours to full), overall ring; detail sheet (weekly sets vs target bar, last
   trained, recovery curve sparkline 0→70→100). Pull-to-refresh.

## Rules
- All data through TanStack Query hooks in `features/training/queries.ts` (query keys `["program"]`, `["workouts", params]`, `["recovery"]`,
  `["training-stats"]`); optimistic mutations with rollback.
- Skeletons for every screen (mirror layout). Empty states (no program → "Program atanmamış" with Floo sleepy).
- Tests: queries with fake client, logger reducer (pure: set completion, skip, add exercise, restore), WeekStrip status mapping, screens render
  skeleton → content with fixtures.
- Keep `pnpm --filter @fitfloow/mobile typecheck`, `test`, `export:web` green.

## Status (append below)

### F2 — training feature delivered (2026-09-10)

**Gates**: `pnpm --filter @fitfloow/mobile exec jest src/features/training` → 6 suites / 82 tests green ·
`typecheck` clean for every file I own · `export:web` succeeded three times (5.3 MB bundle).
Full-suite run: 43/45 suites green — the two reds are F3's `nutrition/NutritionScreen.test.tsx` and
`nutrition/scan/ScanScreen.test.tsx` (in flight while I ran), plus three `Cannot find name 'global'`
typecheck errors in `nutrition/scan/ScanScreen.test.tsx`. Nothing of mine is red.

**What exists** (all under `apps/mobile/src/features/training`, routes `app/(tabs)/program.tsx` + `app/(modals)/workout.tsx`)

- `lib/logger.ts` — the pure logger state machine: `createLoggerState(day)`, `loggerReducer(state, action)`
  (complete/undo set, reps & RIR clamping, add/remove set, skip exercise, ad-hoc exercise, cardio segments,
  rest skip/restart, RPE, notes) plus selectors (`totalSets`, `doneSets`, `progress`, `nextPending`,
  `activeSetIndex`, `restRemaining`, `muscleSets` load-weighted, `totalReps`, `elapsedMinutes`,
  `cardioTotals`, `pace`, `hasAnything`, `toCompleteInput`) and `restoreDraft` (version + day + date guard).
  Clock is always injected (`at` on actions, `now` on selectors) — 21 tests.
- `lib/present.ts` — `stripItems` (week strip label/tone/dot/a11y), `volumeBars` (done vs target, under→primary /
  in→success / over→warning, busiest first), `groupLogsByWeek` + `weekLabel` ("Bu hafta"/"Geçen hafta"/range),
  `logSummary`, `dayCounts`, `RECOVERY_TR`, `recoveryCurve` (0→70→100), `recoveryPosition`, `hoursToFullLabel` — 20 tests.
- `queries.ts` — keys exactly as briefed (`["program"]`, `["recovery"]`, `["workouts", params]`, `["training-stats", n]`,
  plus `["exercises", q]` / `["muscles"]` at 1 h staleTime). Reads: `useProgram`, `useRecovery`, `useWorkouts`,
  `useTrainingStats`, `useExerciseCatalog`, `useMuscles`. Optimistic mutations with rollback + error toast:
  `useSkipDay`, `useCompleteWorkout` (both write today's log and advance the pointer through core's `advancePointer`
  before the round trip), `useJumpTo`, `useUpdateProgram`, `useDeleteWorkout` (purges every cached `["workouts", …]`),
  `useUndoLast`; `useInvalidateTraining()` refreshes program + recovery + workouts + stats + `["home"]`.
- **Program tab** (`program/`): `ProgramScreen` is one FlashList (history) whose header holds the segmented
  Program/Toparlanma switch, `WeekStrip` (7 pills, spring-filled today pill, status dots, tap a logged day → detail sheet),
  `CurrentDayCard` (violet due card with targets + run/swim chips and the screen's single primary action; rest and
  done/skipped variants with undo), `VolumeCard` (mini-bars, top 5 + expand), `ProgramSkeleton` (mirrors every height),
  `HistoryRow` (ReanimatedSwipeable → "Sil"), `LogDetailSheet`, `SkipSheet` (reason chips), `JumpSheet`,
  `ProgramEditorSheet` (one sheet, three modes: drag-reorder day list → day editor with steppers → catalog search;
  saves once via `useUpdateProgram`). Delete is Gmail-style: the row leaves instantly, an undo bar sits above the tab bar
  for 5 s, and the DELETE only fires after that (or on unmount).
- **Workout logger** (`workout/`, route `/(modals)/workout`): `useWorkoutSession` (reducer + MMKV draft written on every
  change and on backgrounding + 1 s ticker), header with set progress / elapsed / pane dots, paged `ExercisePane`
  (logged sets, big steppers for the active set, skip/add/remove set), `CardioPane` (segments, live pace vs target),
  `RestTimer` (90 s, pulsing ring, tap to skip), `AddExerciseSheet`, `FinishSheet` (sets/reps/duration, muscle chips,
  RPE chips, note) → `training.complete` → success state with `SuccessCheck` + Floo cheer, draft cleared, `router.back()`.
  Leaving with logged sets asks "sakla ve çık" / "kaydı sil".
- **Recovery** (`recovery/`): `RecoveryPanel` (overall ring card + muscle grid sorted least-recovered first, pull-to-refresh,
  `RecoverySkeleton`), `MuscleDetailSheet` (readiness ring, 0→70→100 sparkline with the current position, weekly sets vs
  target bar, last trained, residual load).
- `src/lib/fake/training.ts` (**new file, nothing existing rewritten**) — scenario builders over `FakeState` so the demo and
  the tests can reach every branch: `trainingState`, `withDayIndex`, `withCardioDay`, `withRestDay`, `withCompletedToday`,
  `withSkippedToday`, `withEmptyHistory`, `withoutProgram`, `withRecentHistory`. All `/program`, `/workouts`, `/recovery`,
  `/training/stats` routes already existed in `fakeFetch.ts`, so the whole flow is demoable with `EXPO_PUBLIC_API_FAKE=1`.

**Notes / gaps for F4c and the others**
- **FlashList v2 needs a jest mock.** Under Jest it has no layout engine and re-measures forever the moment the list data
  shrinks ("Maximum update depth exceeded" from `ViewHolderCollection.setRenderId`). I mock it locally at the top of
  `program/ProgramScreen.test.tsx`; **hoist that into `jest.setup.js`** — F3's lists will hit the same wall.
- Running a *single* mobile test file often hangs after the last assertion (a pre-existing open handle — `__tests__/features/profile.test.tsx`
  does it too). The full `jest --ci` run is fine because workers are force-exited; use `--forceExit` when running one file.
- The in-progress-workout MMKV key is `training.workout.draft.v1`, declared in `workout/useWorkoutSession.ts` rather than
  `STORAGE_KEYS` (that file belongs to the foundation) — there is a TODO(F4c) to move it.
- No program assigned is modelled as `program.days.length === 0`; `ProgramView.current.day` is then absent, so the screen
  reads `view.current?.day`. If the API ever makes `current` nullable, the type will match reality.
- Recovery has no tab of its own, so it lives in the Program tab's segmented switch ("Toparlanma"); home's recovery strip
  already routes to `/(tabs)/program`.
- Undo after deleting a session is an inline bar (the `Toast` primitive has no action slot) plus a success toast on undo.
- Day reordering is a Reanimated pan on the drag handle (other rows shift on the UI thread) with `moveUp`/`moveDown`
  accessibility actions as the keyboard/screen-reader path — the latter is what the test drives; verify the drag on device.
- Not run on a device: check the pager's momentum snap, the gorhom keyboard behaviour in the editor/finish sheets and the
  rest-timer pulse during the polish pass.
