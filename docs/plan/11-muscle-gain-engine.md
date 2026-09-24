# 11 — Muscle-gain engine, FFMI and the adaptive goal (T7)

Extends the goal engine of [03-goal-engine.md](03-goal-engine.md). Pure maths in `packages/core`
(`core/body`, `core/goal`), served by the `/goals` API. No UI here: T6 (nutrition) and T8
(onboarding) build on this contract. Literature and every constant's source:
[docs/research/muscle-gain-science.md](../research/muscle-gain-science.md).

## Decision record: one plan type, three directions

**Context.** The engine only planned fat loss (`TARGET_ABOVE_CURRENT` otherwise). The product
needs muscle gain and recomposition with the same roadmap, charts and progress bars.

**Decision.** `GoalPlan` gains a `direction: "cut" | "bulk" | "recomp"` and keeps one shape. The
weekly roadmap is identical in every direction, so the roadmap screen, the weekly report, the
nutrition target and the charts keep working. `computeGoalPlan(input)` dispatches on
`input.direction` (default `cut`, bit-for-bit the old engine).

Sign conventions that make this work:

| field | meaning in every direction |
|---|---|
| `weeklyDeficitKcal`, `cumulativeDeficitKcal`, `totalDeficitKcal` | energy *deficit*; negative on a bulk (a surplus) |
| `dailyCalorieTarget + weeklyDeficitKcal / 7` | the week's TDEE (unchanged identity) |
| `rateKgPerWeek`, `totalLossKg` | *size* of the weight change, ≥ 0; `direction` says which way |
| `targetWeightKg` | weight at the end of the plan |
| `startLeanMassKg`, `endLeanMassKg` (week) · `leanGainKg`, `fatGainKg`, `ffmiStart`, `ffmiEnd` (plan) | new, optional (older stored plans lack them) |

**Consequences.** Old goals parse unchanged (`direction` defaults to `cut`, the API fills the new
goal fields). Admin and mobile warning maps gained the four new warnings.

**Alternatives rejected.** A separate `BulkPlan` type (every consumer would branch); signed rates
(breaks every existing "kg kaldı" display).

## FFMI (`core/body/ffmi.ts`)

`FFMI = lean kg / height m²`, normalised `+ 6.1 × (1.8 − height m)` (Kouri 1995). Bands:

| band | men | women |
|---|---|---|
| `low` | < 18 | < 14.5 |
| `average` | 18–20 | 14.5–16.5 |
| `good` | 20–22 | 16.5–18.5 |
| `advanced` | 22–25 | 18.5–21.5 |
| `nearLimit` | ≥ 25 | ≥ 21.5 |

`ffmiGauge` maps the value to 0–100 between "low − 3" and the natural ceiling, for a ring.

## Assessment and recommendation (`core/body/assessment.ts`)

`assessBody({ sex, weightKg, heightCm, bodyFatPct, trainingLevel?, settings })` returns FFMI, bands,
Turkish labels, `leanToCeilingKg`, the training level (stated or inferred from FFMI) and
`recommendation`:

| men's body fat (women + 8) | recommendation |
|---|---|
| ≥ 25 % | cut, to max(15 %, bf − 10) (women 23 %) |
| 20–25 % | cut; **recomp** for a beginner with low FFMI |
| 15–20 % | low FFMI → recomp (alt. bulk); otherwise a short cut to 12 % (women 20 %) |
| < 15 % | lean bulk: 20 weeks of the literature rate, rounded to 0.5 kg; near the FFMI limit → recomp |

Each recommendation carries `reasonTr` (Floo's sentence) and `alternatives`.

## Muscle-gain rate (`core/goal/muscle.ts`)

```
lean kg/week = weight × leanGainPctBwPerMonth[level] / 100 / 4.345
               × (female ? 0.75 : 1) × profile.lean × taper(FFMI)
fat kg/week  = lean × fatPerLeanKg[level] × profile.fat / taper
surplus      = lean × 2500 + fat × 7700 kcal/week
```

Levels 1.15 / 0.6 / 0.3 % BW a month (≈ 1.0 / 0.45 / 0.2 kg for an 80 kg man: Aragon and
McDonald averaged); fat per lean 0.7 / 1.1 / 1.4. The taper is 1 until 3 FFMI points below the
ceiling (men 25, women 21.5) and falls linearly to 0.15 at it. The level steps up once per
simulated year (McDonald). All constants live in `settings.goal.muscle` (admin-editable, defaulted
for settings stored before T7).

## Bulk and recomp plans (`core/goal/directions.ts`)

- **Bulk** — input `targetLeanGainKg`. Weekly: lean + fat from the rate, TDEE grows with the tissue
  added (22 kcal/day per kg, the cut engine's term reversed; skipped when a measured TDEE is set),
  calories = TDEE + surplus/7. Protein 1.8 g/kg bodyweight. Warnings `BULK_BF_CEILING` (at or
  crossing 20 % / 28 %), `NEAR_NATURAL_LIMIT`, `LONG_HORIZON`.
- **Recomp** — input `targetBodyFatPct`. Deficit 10 % of TDEE (max 500 kcal), respecting the calorie
  floor; lean gain = bulk rate × 0.5 / 0.4 / 0.25 by level, paid for from fat
  (`fat = (deficit + lean × 2500) / 7700`). Warnings `RECOMP_SLOW` (advanced),
  `TARGET_NOT_BELOW_CURRENT`.

## Progress in three directions (`core/goal/progress.ts`)

`onTrack: "ahead"` always means *further along the plan than planned*: lighter on a cut, heavier
on a bulk, leaner on a recomp. `percentComplete` is weight-based for cut and bulk, body-fat-based
for recomp (latest reading). `trendDeviationAt(goal, weighIns, key)` gives the trend-vs-plan kg
difference for any day. `expectedAtDay` also returns the planned `leanMassKg`.

### Recomp on body fat (`bodyFatTrend`)

A recomp's weight is flat by design, so its `onTrack` and projected end never come from the scale.
They come from the tape readings (body fat and the lean mass derived from it) against the roadmap's
expected per-day values. Sources and calibration are in the research doc, §8.

- **Readings:** since the plan (re)started, at most `bfWindowDays` (112) before today, one per day
  (the last one of a day in input order wins).
- **Residuals:** each reading minus the plan's expected body fat / lean mass on its day. A
  least-squares line goes through these residuals.
  - Its **slope** is the pace gap (`paceGapPtsPerWeek`): observed minus planned change a week.
    The plan is drawn from one start reading that is itself ±1.5 points off. That error shifts
    every residual by the same amount, so it cannot bias the slope.
  - Its **value at the latest reading** is the gap to the plan's level (`deviationPts`,
    `deviationLeanKg`), and that gap *does* carry the start reading's error.
  - Noise per reading is the larger of the literature floor (`bfNoisePts` 1.5 points; for lean
    mass that noise scaled by weight, plus scale noise) and the person's own scatter around the
    line.
- **Enough data:** at least `bfMinMeasurements` (3) readings, spanning at least `bfMinSpanDays` (21)
  days, the latest no older than `bfMaxAgeDays` (14) days. Until then `onTrack` stays `onTrack`,
  whatever the scale does.
- **Verdict:** the pace gap must exceed `bfConfidenceZ` (2.25) standard errors (`paceZ`), and the
  level must be off by at least `bfTolerancePts` (1) the same way. Slower than planned is `behind`,
  or `stalled` when body fat falls slower than `bfStallPtsPerWeek` (0.05). Faster is `ahead`.
  `leanLoss` means the lean pace is significantly below plan (`leanPaceZ`), lean mass is at least
  `leanToleranceKg` (1) below plan, and it is falling.
- **Smoothed body fat now** (`smoothedBodyFat`): the line through the readings of the window,
  whichever plan they belong to, read at the latest one (≥ 3 readings). It is used for `reached`
  and for the projection's distance.
- **Projection:** smoothed distance to the target ÷ pace. The pace is the plan's rate until a
  verdict says the observed pace differs; then it is the observed one.
- **A re-plan starts a new series.** Accepting a proposal or a recalibration re-plans from today,
  and the verdict only reads readings since then. A dismissal changes nothing.

In simulation, with the start reading as noisy as every other reading, over a whole 18-week plan:
- weekly readings at 1-point tape noise: no one on plan gets a proposal
- at 1.6 points: ≈ 5 % of people on plan get one
- a full stall is caught in ≈ 99 % of cases, typically around week 13

Tape noise simply does not allow a faster call. A faster call would need a better start reading
(for example, the mean of two) or a more precise method. See research doc §8.

## Adaptive goal (`core/goal/adjust.ts`)

Never applied silently: the engine builds a **proposal**, Floo shows it, the user accepts one
option with one tap (or dismisses it).

| situation | when | options (first = recommended) |
|---|---|---|
| `reached` | cut/bulk: trend within 0.1 kg of the target weight; recomp: latest body fat ≤ target **and**, once there are ≥ 3 readings, the smoothed body fat ≤ target too. No cool-down. | complete · continue with a tighter target (cut/bulk) |
| cut `ahead` | trend ≥ 0.4 kg ahead today **and** 7 days ago | re-plan from today (earlier date) · target −1 point |
| cut `behind` / `stalled` | ≥ 0.4 kg behind today and 7 days ago / trend flat 14 days | lower calories · keep calories, move the date |
| recomp `ahead` | body-fat verdict `ahead` now **and** at the previous reading, lean mass held | re-plan from today (earlier date) · target −1 point |
| recomp `ahead` (muscle) | lean loss now and at the previous reading, while body fat is on plan or ahead | raise calories · re-plan |
| recomp `behind` / `stalled` | body-fat verdict behind/stalled now and at the previous reading | lower calories · keep calories, re-plan (only the re-plan at the calorie floor) |
| recomp `behind` / `stalled` + lean loss | as above while lean mass falls | re-plan only (fewer calories would cost more muscle; Floo points at protein and training) |
| bulk `ahead` | 4-week gain > 1.5 × plan (extra is fat) | lower calories · re-plan |
| bulk `behind` / `stalled` | gain < 0.5 × plan / ≤ 0.02 kg a week | raise calories · re-plan |

A recomp never gets a proposal from weight alone. Without enough tape readings it only ever gets
`reached`; the feedback line asks for a measurement instead. A new recomp proposal also needs a
reading taken after the last answer, so a dismissed proposal is never re-made from the same evidence. Proposals carry `deviationBfPts` and
`deviationLeanKg` for a recomp (null otherwise). `deviationKg` stays the weight-trend deviation.

Only after a **21-day cool-down** from the plan (re)start or the last answer (first weeks are water
and glycogen; the literature waits ≥ 3 weeks). All thresholds live in `settings.goal.adaptive`,
which is admin-editable. The recomp body-fat constants are defaulted one by one, so adaptive blocks
stored before them still parse. Calorie steps: the measured TDEE when
recalibration has one pointing the same way, else ± 150 kcal. Each option carries `after`, a
preview built by the real engine; accepting re-runs exactly that re-plan from the same state
(weight = EWMA trend, lean mass carried forward from the last tape measurement using the plan's own
lean-per-kg ratio; a recomp with enough readings starts from the fitted body fat at its latest
reading instead of that one reading). The proposal id is deterministic (`goal | kind | plan start | since`), so the
same situation keeps the same id until it is answered. Answers are stored on the goal as
`adjustments[]` (chart markers; `before`/`after` snapshots).

## Instant feedback (`core/goal/feedback.ts`)

`evaluateGoal(...)` → `{ progress, feedback, adjustment }` — one call after every entry.
`feedback` = `{ status, tone, mood, trigger, textTr, deviationKg, deviationBfPts, weeksSaved, bars }`:
e.g. `"Plandan 0,6 kg öndesin! Bu tempoyla 8 yerine 7 haftada bitebilir."`
`bars` are 0–100: `goal`, `time`, `lean` (bulk/recomp, needs a measurement; progress from the goal
start toward the lean target counted from the goal start), `fat` (cut/recomp).
`mood` is a Floo mood; `trigger` is a key for the mascot queue (`goal.feedback.*`,
`goal.adjust.*`, `goal.completed`).

A recomp speaks in body fat: `"Yağ oranında plandan 1,2 puan öndesin!"`, `"Yağ oranın planda, %40
tamamlandı."`, or a lean-mass warning. `deviationBfPts` is the trend-vs-plan gap in points; it is
null on cut/bulk and until there are enough readings. Until then the line is an invitation to
measure: trigger `goal.feedback.measure`, tone `neutral`, status as `progress.onTrack`. If there has
been no reading for 7 days it says: "Rekompta kilo pek değişmez; ilerlemeyi yağ oranın gösterir.
Yeni bir mezura ölçümü ekle…". Otherwise it says: "Ölçümün kaydedildi… haftada bir yeterli."

## API

| method | path | body / query | response |
|---|---|---|---|
| GET | `/goals/assessment` | `?trainingLevel=beginner\|intermediate\|advanced` | `{ assessment: BodyAssessment }` (400 `NO_BODY_ENTRY`) |
| POST | `/goals/preview` | `GoalInput` | `{ plan, warnings }` |
| POST | `/goals` | `GoalInput` | `{ goal }` |
| PATCH | `/goals/current` | `GoalUpdate` (a new `direction` restarts the journey from today) | `{ goal }` |
| GET | `/goals/current` | — | `GoalView = { goal, progress, feedback, adjustment }` |
| POST | `/goals/current/adjustment/accept` | `{ id, action? }` (no action → recommended) | `{ goal, adjustment }` · 409 `ADJUSTMENT_STALE` |
| POST | `/goals/current/adjustment/dismiss` | `{ id }` | `{ goal, adjustment }` · 409 `ADJUSTMENT_STALE` |

`GoalInput = { direction?, targetBodyFatPct?, targetLeanGainKg?, trainingLevel?, profile }`:
`{ targetBodyFatPct }` alone is a cut (old clients unchanged); `{ targetLeanGainKg }` alone is a
bulk; recomp needs `targetBodyFatPct`. `POST /onboarding`'s `goal` accepts the same shape.
`GoalDTO` adds `direction`, `targetLeanGainKg` (total lean gain from the goal start),
`trainingLevel`, `adjustments`. api-client: `goals.assessment()`, `goals.acceptAdjustment()`,
`goals.dismissAdjustment()`.

Client flow after every weigh-in or measurement: refetch `GET /goals/current`, push
`feedback.textTr` into `useFloo().say()` with `feedback.mood`/`trigger`, update the bars, and when
`adjustment` is set show `adjustment.messageTr` with one button per `options[]` (labels are ready
in `labelTr`, `after` has the numbers to show).

Everything is also callable locally from `@fitfloow/core` (`assessBody`, `computeGoalPlan`,
`evaluateGoal`) for instant previews while the user drags a slider.
