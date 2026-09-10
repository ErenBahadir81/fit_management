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
