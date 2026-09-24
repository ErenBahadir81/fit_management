# T5 Antrenman UI — prep notes (paused 2026-09-24 07:31Z on Eren's request)

State: prep only, no code written. Branch `claude/t5-workout-ui-1ipecr` (local only, = origin/main after PR #1).

Done:
- Read plan sections 3, 4, 6, 8. T5 skills: frontend-design, emil-design-eng, dataviz (volume bars); visual check: design-motion-principles, run.
- Baseline Chromium screenshots of current app (fake API) in `baseline/` (home, program tab). Scripts: `serve.mjs` (static SPA server) + `baseline.mjs` (login eren/eren123 via fake API, click tab-program).
  Build: `cd apps/mobile && EXPO_PUBLIC_API_FAKE=1 pnpm exec expo export --platform web --output-dir <dir>`; Chromium context needs `ignoreHTTPSErrors: true` (Skia wasm via proxy). Full-page reload loses login, navigate by tab testids.
- Sent T3 (cse_01NWTiawEnfqh2cbYfTUQbg6) interface questions: branch, program shape (mode/day ids/pointer), logDay signature, volume engine exports + band output, 17 muscle keys, mobile hooks. T3 is itself rewriting `apps/mobile/src/features/training/queries.ts` and `lib/fake` → T5 must NOT edit those, only consume. Check T3's reply on resume.

Existing screens to redo: `apps/mobile/src/features/training/program/*` (ProgramScreen, CurrentDayCard, ProgramEditorSheet 396 lines, JumpSheet, SkipSheet, VolumeCard, WeekStrip), workout logger in `workout/*`.

Next on resume: read T3's answer/branch, open editor + workout logger baseline, design flows, wait for T1 foundation before building screens.

## T3 interface (answer received 07:32Z)
- Branch `claude/t3-workout-logic-1luxsm`. ProgramDTO: mode "cycle"|"weekly"; days[].id stable; `currentDayId`; `cycleNumber` (weekNumber deprecated); weekly = exactly 7 days, index 0 = Monday (`weekdaySlot()`). PUT /program {name?, mode?, days[]} — send ids back, new days omit id.
- POST /program/log-day {dayId, resumePlanned?, ...CompleteWorkoutInput} = the pointer-moving op; relogging same day replaces. complete/skip/jump{dayId}/undo-last/DELETE still exist. WorkoutLogDTO: dayId, cycleNumber, isBreak.
- core/training/volumeBands.ts: rateVolume, bandStatus, perWeek, volumeAdvice, programVolume(days, muscles, {mode, catalog}) → use live in editor on draft days. ProgramView.plannedVolume; weeklyVolume rows carry zone/score/risk/severity.
- 17 keys: chest, frontDelt, sideDelt, rearDelt, traps, lats, lowerBack, biceps, triceps, forearms, abs, obliques, quads, hamstrings, glutes, adductors, calves.
- Hooks (T3-owned queries.ts): useLogDay, useSkipDay, useCompleteWorkout, useJumpTo(dayId), useUpdateProgram, useUndoLast, useDeleteWorkout; helpers applyLogDay/applySkip/applyJump/applyProgramUpdate. Logger switch to logDay({dayId}) = T5's job.
