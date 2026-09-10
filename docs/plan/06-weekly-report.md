# 06 — Weekly Report & Week Boundaries (`packages/core/src/reports`, module B3)

## Week definition
- `measurementDay ∈ 0..6` (0 = Sunday, default). The week **starts** on that day at 00:00 TR and ends the day before the next one.
- `weekKeyFor(dateKey, measurementDay)` → dateKey of the week start. `weekRange(weekKey)` → `[startKey, endKey]` (7 keys).
- Measurement day is also the "report day": the report for the *finished* week is highlighted on that day; the current week's report is
  live and refreshes as data enters (cache invalidation on any write in that range).
- Changing `measurementDay` re-keys future weeks only; cached reports are dropped.

## WeeklyReportDTO
```
{
  weekKey, startKey, endKey, dayIndexToday (0..6 | null if past/future), isCurrent, measurementDay,
  goal: null | {
    targetBodyFatPct, profile, weekIndexInPlan, plannedDailyTarget, plannedWeeklyDeficit, tdeeUsed,
    expectedWeightEnd, expectedBfEnd
  },
  nutrition: {
    daysLogged, avgKcal, totalKcal, targetKcal (daily), avgProtein, proteinTarget,
    deficitBankedKcal,                       // Σ(tdeeUsed − intake) over logged days
    deficitPlannedKcal,                      // plannedWeeklyDeficit × (daysElapsed/7) for current week
    deficitPct,                              // banked / planned × 100
    fatEquivalentKg,                         // banked / kcalPerKgFat
    days: [{ dateKey, kcal, protein, carbs, fat, logged, deficit }]
  },
  body: {
    weightStart, weightEnd, weightDelta, ewmaStart, ewmaEnd, ewmaDelta, expectedDelta,
    bodyFatStart?, bodyFatEnd?, waistStart?, waistEnd?, weighInDays, hasMeasurement
  },
  training: {
    sessions, plannedSessions, offDays, sets, volumeByMuscle: [{key, name, done, target:{min,max}, status}], cardioKm
  },
  goalDistance: null | { kgToGo, bfToGo, weeksRemainingPlan, weeksRemainingProjected, percentComplete, onTrack, projectedDate },
  score: 0..100,                              // weighted: deficit adherence 40, logging 20, training 25, weigh-ins 15
  highlights: string[],                       // TR sentences ("4 antrenmanın 4'ünü tamamladın")
  mascot: { mood, text }
}
```
`WeeklyReportSummary` (history/charts): `{ weekKey, score, avgKcal, deficitBankedKcal, ewmaDelta, sessions, bodyFatEnd?, weightEnd? }`.

## On-track logic (also used by GoalProgress)
Compare EWMA weight at week end (or now) with the plan's expected weight → `ahead | onTrack | behind | stalled` (thresholds in 03).
Score bands → mascot mood: ≥ 80 cheer/flex, 60–79 happy, 40–59 think, < 40 worried (never shaming copy).

## Home composite (`/reports/home`)
Built from the same pure functions; must be one DB round-trip per collection (program, today's log, last 72 h logs, today's meals,
weigh-ins 30 d, latest body entry, goal, settings, mascot messages) and < 40 ms in tests with in-memory Mongo.

## Tests (first)
- weekKeyFor: Sunday start: `2026-09-10` (Thu) → `2026-09-06`; Monday start → `2026-09-07`; boundary day equals itself; year wrap.
- report with no data → zeros, `score 0`, mascot "sleepy" message key `report.empty`.
- deficit ignores unlogged days; planned scales with elapsed days for the current week; full 7 for past weeks.
- score weights sum to 100 and clamp.
- cache invalidation: writing a weigh-in for a date inside a cached week removes the cache doc.
