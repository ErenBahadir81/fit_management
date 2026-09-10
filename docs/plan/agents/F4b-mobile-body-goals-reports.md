# F4b — Mobile: Body measurements, Goal setup & roadmap, Weekly report (Fable 5.1)

Read `COMMON.md`, your own `apps/mobile/src/ui/README.md`, `07-mobile-app.md` §Screens 8–10, `03-goal-engine.md`, `06-weekly-report.md`,
`09-mascot.md`, `02-api-contract.md` (Body, Goals, Reports), `packages/core/src/schemas/{body,goal,report}.ts`, `packages/core/src/{navy,goal,reports}/`
(client-side live previews: Navy from core; goal preview via API `goals.preview` with a debounced call, or core `computeGoalPlan` if exported —
prefer core for instant feedback and call the API for the authoritative plan).

## You own
- `apps/mobile/src/features/{body,goals,reports}/**`, route `apps/mobile/app/(tabs)/body.tsx` (replace placeholder), nested routes for
  goal setup/roadmap and weekly report (e.g. `app/(modals)/goal/**`, `app/report/[week].tsx` — follow the structure you defined in F4a),
  tests alongside. Extend `src/lib/fake/` with body/goal/report fixtures.

## Screens (this is the product's report heart — make it exceptional)
1. **Body**: hero card (EWMA weight big numeral with ±7 d delta, bf % pill with ±3.5 uncertainty hint, lean mass, waist), inline **quick weigh-in**
   (stepper prefilled with last weight, one tap "Kaydet", haptic, optimistic point on the chart), trends chart (segmented 30/90/180/365; raw dots
   faded, EWMA line, goal target line dashed when a goal exists; scrub with haptic ticks and a floating value label), measurement history
   (FlashList, swipe delete), "Ölçüm ekle" sheet: gender/height prefilled, neck/waist/(hip) with steppers + numeric input, live Navy preview
   (bf %, fat kg, lean kg, category) and validation copy (bel > boyun), save → success.
2. **Goal setup**: current bf pill → target slider (0.5 steps, min = safe floor by sex, snapping haptics) → profile segmented (Temkinli/Optimal/Agresif
   with one-line explanations) → live preview card (fat to lose kg, weeks, daily kcal, target date, warnings as inline chips) → "Hedefi başlat"
   (Floo `goal.created` cheer). **Roadmap**: header progress (percent ring, kg to go, on-track chip colored, projected date), chart expected vs
   actual EWMA, week list (FlashList: week n, dates, planned kcal/day, deficit, expected weight; current week highlighted; past weeks show actual
   vs expected delta), "Yeniden kalibre et" with an explainer sheet showing the recalibration result, edit target / abandon in an overflow menu.
3. **Weekly report** (`/reports/weekly`): hero with score ring + Floo message (mood from report), deficit card ("Bu hafta {kcal} kcal ekside kaldın ≈
   {kg} kg yağ" with per-day bars vs planned line, logged/unlogged days distinguishable), body card (EWMA delta vs expected, bf/waist start→end),
   training card (sessions/planned, volume vs targets mini-matrix), goal distance card, highlights list, week switcher (‹ › with measurement-day
   labels; current week live badge), history carousel (last 12 weeks score sparkline). Report screen must feel like a designed magazine page,
   not a table.
4. Tests: Navy preview math, slider clamping, goal preview debounce hook with fake client, report screen renders with fixture (score ring value,
   mascot text), weigh-in optimistic update.

Keep typecheck/tests/export:web green. Append Status to this file.

## Status (append below)
