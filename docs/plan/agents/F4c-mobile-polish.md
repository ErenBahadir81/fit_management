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
