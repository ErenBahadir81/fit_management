# T8 Onboarding: prep notes (paused 2026-09-24 07:31Z on Eren's request)

State: prep only, no code written, nothing pushed. Branch to use: `claude/t8-onboarding-8qa7f3`, based on origin/main.

## Existing code (baseline)
- apps/mobile/src/features/onboarding: model.ts (6-step machine welcome/account/about/measure/goal/done, validation, payload), draft.ts (MMKV draft, key onboarding.draft.v1, no password), useOnboarding.ts (register on leaving account, POST /onboarding on leaving goal), OnboardingScreen.tsx, steps/*.
- POST /onboarding schema: packages/core/src/schemas/onboarding.ts (goal = {targetBodyFatPct, profile} | null, fat loss only).
- Fake API mode supports register + onboarding: `EXPO_PUBLIC_API_FAKE=1 CI=1 npx expo start --web` in apps/mobile. First web bundle ~20 s; first page load can exceed 2 min. Playwright needs `executablePath: "/opt/pw-browsers/chromium"` (its bundled headless shell 1243 is missing).
- Baseline screenshots not captured yet (the first load timed out; retry with a longer wait).

## Messages sent (replies expected via send_message)
- T7 (cse_01LgHcht8prSpvFjZPJFvFqx): asked for pure client-side `assessBody` (FFMI, band, TR interpretation, recommendation) and a plan preview (weeks, weekly rate, kcal); which extra inputs it needs (proposed training experience none/<1y/1-3y/3y+ and weekly training days); proposed that onboarding's goal field reuses T7's goal-create schema and the API onboarding service calls T7's goal service.
- T2 (cse_01A2qtm5buQcgUHHtLqknzj3): asked for the component API: full body at 120-180 px, play a gesture once with an onDone callback, IK pointAt, walk on/off (who owns the translation), reduced motion; poses wave, think, point, thumbsUp, clap/cheer, flex, shrug/worried, celebrate, walk.

## Planned flow (plan section 7)
1 hello + name/account, 2 gender/birth/height, 3 weight/neck/waist(/hip) with a live fat ring, 4 activity + weekly training days + experience, 5 "current state" card (fat %, LBM, FFMI + interpretation), 6 Floo's goal recommendation with slider and live duration/weekly rate, 7 finish. Draft persisted, resume where left off.

## Remaining estimate
Whole T8 still ahead: about 6-9 h wall-clock after T1, T2 and T7 land (plan section 8).

## T7 reply (07:36Z): contract agreed
Draft PR #4, branch claude/t7-goal-engine-20i5l6; contract in docs/plan/11-muscle-gain-engine.md there.
- Pure core: `assessBody({sex, weightKg, heightCm, bodyFatPct, trainingLevel?, settings})` → BodyAssessment (ffmi, ffmiBandTr, ffmiGauge 0-100, bodyFatBandTr, summaryTr, recommendation {direction, targetBodyFatPct|null, targetLeanGainKg|null, reasonTr, alternatives[]}); `computeGoalPlan({... direction, target, trainingLevel?, profile, startDate, settings})` → GoalPlan (estimatedWeeks, targetDate, initialRateKgPerWeek, initialDailyCalorieTarget, macros, roadmap, summaryTr, warnings). settings = DEFAULT_GOAL_SETTINGS. Pace = profile conservative|optimal|aggressive.
- New input: `trainingLevel` beginner|intermediate|advanced (zTrainingLevel) on the goal input; none/<1y→beginner, 1-3y→intermediate, 3y+→advanced. Weekly training days not used by the engine.
- zOnboardingGoal = zGoalInput already on T7's branch and onboarding.routes calls createGoal. bulk needs targetLeanGainKg; cut/recomp need targetBodyFatPct. No T8 change needed there.
- After onboarding, GET /goals/current returns feedback {textTr, mood, trigger, bars{goal,time,lean,fat}}.

## T2 reply (07:44Z): Floo API agreed
Draft PR #5, branch claude/t2-floo-character-holrr1. `import { FlooModel, flooBox, gestureDuration } from "src/mascot/model"`.
- `<FlooModel size={160} mood="happy" gesture={{name:"wave", key:n, mirror?}} pointAt={{x,y}|null} walking={bool} lod?="full" />`; height = flooBox(width).height (full 1.45×); ≥96 px → LOD full.
- Gesture plays once then returns to mood pose; bump key to replay. No completion callback yet: sequence with gestureDuration(name) ms (T2 may add onGestureEnd on resume).
- pointAt in Floo-local px (0,0 top-left of Floo box); nearer hand IK-reaches, holds until null. Convert: target.pageX - flooView.pageX.
- Walk: T8 owns translateX; `walking` runs the in-place cycle.
- Reduced motion: gestures/walk skipped, moods cross-fade.
- Gestures: wave, think, point, thumbsUp, clap, cheer, flex, shrug, whoa, fistPump. No measuring tape. Moods: idle happy celebrate sad worried sleepy think proud energetic.
