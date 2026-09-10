# F4c — Mobile: final integration & polish pass (Fable 5.1)

Read `COMMON.md`, the Status sections of F2/F3/F4b, and walk every screen in `apps/mobile`. Goal: one coherent, flawless app.

## Checklist
1. Consistency: every screen uses the same primitives, spacing, type scale, skeleton pattern, empty/error states; remove any ad-hoc styles that
   drift from the tokens; unify haptics and press feedback; unify sheet behaviour (dynamic size, keyboard, backdrop).
2. Performance: FlashList everywhere lists can grow; memoized rows; no inline object styles inside rows; images via expo-image; no JS-thread
   animations; query keys and invalidations correct (writes in one feature update home/report/goal queries); persisted cache hydration before
   first paint; measure `export:web` bundle and remove accidental heavy imports.
3. Motion polish: tab transitions, sheet springs, stagger on screen enter, scan theatre timing, workout set completion feedback, weigh-in
   optimistic point animation, report hero score count-up (reanimated), Floo idle/blink cadence.
4. Copy: Turkish, consistent tone; no English leaks in UI; dates via `formatTRDate`; numbers tabular.
5. Robustness: offline (cached data + disabled writes with a toast), 401 → login, 503 vision fallback, empty program, no goal, no body entry.
6. Tests: fix any failing, add smoke tests per screen (render with fixtures), ensure `pnpm --filter @fitfloow/mobile test`, `typecheck`, `lint`,
   `export:web` all green; update `apps/mobile/README.md` (run, env `EXPO_PUBLIC_API_URL`, fake mode, structure, testing).

Append Status to this file with a before/after list of concrete fixes.

## Status (append below)

### F4c — integration & polish delivered (2026-09-11)

**Gates (final)**: `pnpm --filter @fitfloow/mobile typecheck` clean · `lint` **0 errors / 0 warnings** (was 42 errors / 22 warnings) ·
`test` **46 suites / 331 tests green** (was 46 / 319; +12 route smoke tests) · `export:web` succeeded, entry bundle
**4.89 MB (was 5.34 MB, −448 KB)**. Single test files no longer hang after the last assertion (`--detectOpenHandles` clean).

**Before → after**

*Tests & infra*
- FlashList v2 mock duplicated in `ProgramScreen.test.tsx` + `__tests__/mocks/flashList.ts` (measure-layout hack), missing in the nutrition tests → one eager ScrollView-backed mock hoisted into `jest.setup.js` (header/empty/footer slots, `renderScrollComponent`, refresh control); both mock files and every local `jest.mock` for FlashList/Swipeable deleted.
- expo-camera / expo-image mocked per test file → hoisted defaults in `jest.setup.js` (test files can still override to drive a scan).
- react-query mutation GC (5 min timer) kept Jest alive; `makeQueryClient` now sets `mutations.gcTime: 0`; the private `testClient()` copies in the nutrition/scan tests are gone.
- Date-flaky fixtures: body/goal/report screen tests pinned `TODAY = "2026-09-10"` while the screens read the real Türkiye clock — they went red at 00:00 +03 during this pass. `createFakeFetch` now builds its fixtures for the injected `today()` and those tests use `todayKey()`.
- `jest.mock` factories used `require()` (15 lint warnings) → `jest.requireActual`.
- New `__tests__/smoke.test.tsx`: every route file (`(tabs)/*`, `(modals)/*`, login, not-found) mounts from the demo API and shows its key element; plus the expired-session login line.
- act() noise: 40+ warnings per run → 12 (the VirtualizedList ones vanished with the ScrollView day pager); the workout "saved" timer is cleared on unmount, the rest-timer pulse is cancelled (not just reassigned). The full multi-worker `jest --ci` run still prints one "worker process has failed to exit gracefully" notice at the very end (reanimated's frame loop; `--detectOpenHandles` finds nothing, every suite exits on its own when run alone) — cosmetic, no test is affected.

*Consistency (one implementation each)*
- Swipe-to-delete: RNGH `ReanimatedSwipeable` (training history, body rows; logged worklet warnings) + a nutrition-only pan gesture → `src/ui/SwipeToDelete` (UI-thread pan; short swipe snaps open on a tappable "Sil", long swipe/fling commits; action stays in the a11y tree; every row also exposes a `delete` accessibility action).
- Undo: an inline bar in the program screen + a nutrition `UndoBar` with different timers → `src/ui/UndoBar` + `src/lib/useUndoWindow` (5 s window, commits on expiry/replacement/unmount, never on undo).
- Sheets: nutrition sheets each carried `useSheet` + `useEffect(present)`; `Sheet` now has a declarative `open` prop and one `gentle` spring (`animationConfigs`) for every sheet; reduced motion → clamped short spring. `useSheet` results are destructured where the ref feeds JSX (`<Sheet ref={sheet.ref}>` trips the React Compiler refs rule).
- Skeletons: nutrition day/week/search skeletons were plain Views → `SkeletonGroup` (a11y-hidden, "Yükleniyor") like every other screen; raw `24`/`18` radii → `radii.card`/`radii.md`.
- Pull-to-refresh on FlashList screens used the untinted `refreshing/onRefresh` props → `ListRefreshControl` (primary tint) everywhere, matching `Screen`.
- Haptics: set completion fired `success` (and the finish fired it twice — mutation + `SuccessCheck`) → `medium` per set, one `success` per big moment (SuccessCheck owns it; removed the duplicates in complete-workout, create-goal, create-measurement, scan save).
- Tokens: raw `#FFFFFF` / `rgba(255,255,255,…)` in TodayCard, CurrentDayCard, PreviewCard, Button inverse, Toggle knob, profile avatar, MeasurementRow, report "Canlı" dot → new `onPrimary`, `onPrimaryMuted`, `onPrimaryBorder` tokens (`<Text color="onPrimary">`). `PlaceholderScreen` removed.
- Copy: "BUGÜNÜN ANTRENMANI" / "2. HAFTA · 3. GÜN" shouting labels → sentence case; workout modal with no program said "dinlenme günü" → "Program atanmamış"; expired session explains itself on login ("Oturumun süresi doldu").

*Performance*
- Rows memoized: `HistoryRow`, `EntryRow`/`MealHeaderRow`/`MealAddRow`/`MealEmptyRow`, `MuscleCard`, `DayCell`; `renderItem` / `contentContainerStyle` / list header memoized in Program, Body and Nutrition (no inline objects per render).
- `ProgramScreen` called `useMemo` after an early return (rules-of-hooks) with an `exhaustive-deps` suppression → hooks first, deps complete.
- Day pager `FlatList` (act warnings, no rows without layout events) → plain snapping `ScrollView` (31 cells).
- Icon: `@expo/vector-icons` index pulled every glyph map → `@expo/vector-icons/Ionicons` (−448 KB web entry). The FakeApi `require` is now behind a per-file `process.env.EXPO_PUBLIC_API_FAKE` check (Metro inlines it) — the module itself still lands in the graph without tree shaking, ~70 KB; noted, not worth an experimental Metro flag.
- Invalidation matrix completed: completing/skipping/deleting a workout and editing the program refresh `["report"]` (+ mascot); logging a meal / changing the target refreshes `["report"]`; goal changes refresh the nutrition target, day and week (the target derives from the plan); a profile change invalidates everything (measurement day / activity feed every composite). Weigh-ins already refreshed body + goal + report + home.

*Motion*
- Tab switches: none → `animation: "shift"` (fade under reduced motion, 200 ms `durations.base`).
- Set completion: done rows animate in (`LinearTransition` spring, check badge `ZoomIn` bouncy) instead of appearing.
- Weigh-in: `Scatter` points now animate with the EWMA line in `LineTrend` / `PlanTrendChart`.
- Sheet springs unified (see above); count-up, scan theatre, stagger and Floo cadence were already in place and kept.

*Robustness*
- Offline / 429 / 503 on any write: every mutation toast goes through `describeError` ("Bağlantı yok. İnternet gelince tekrar dene." …) with rollback; 401 → forced sign-out with `signedOutReason: "expired"`; sign-out also clears the workout draft (`STORAGE_KEYS.workoutDraft`, the F2 TODO).
- React Compiler lint (eslint-config-expo 57) drove real fixes: shared values written through `.set()/.get()` in callbacks/gestures (Pressable, LoginScreen, TargetSlider, ProgramEditorSheet, Reveal, CountUp, PreviewCard, WeeklyReportScreen), no state copied in effects (`useWorkoutSession` seeds during render, `ProgramEditorSheet` draft, `GoalSetupScreen` derived target/profile, `useDebouncedValue`, `Reveal`, `CountUp`), `Stepper`/`Reveal` refs off the render path.

**Docs**: `apps/mobile/README.md` rewritten (run, env, fake mode, structure, query-key/invalidation table, testing recipes); `src/ui/README.md` catalog updated (new primitives, haptic vocabulary, sheet modes, on-primary tokens, testing notes).

**Not verifiable here (no device)**: swipe thresholds/feel of `SwipeToDelete`, the `shift` tab transition with the custom bar, gorhom keyboard behaviour in the measurement/search sheets, Skia sizing. All flows are exercised through the fake API in Jest and the web bundle builds.
