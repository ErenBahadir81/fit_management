# 03 — Goal Engine (`packages/core/src/goal`)

Pure functions. All constants come from `GoalSettings` (admin-editable, see 01 §settings).
Research defaults live in `docs/research/fat-loss-science.md`; the numbers below are the seed values.

## Inputs
```
GoalInput {
  sex: "male"|"female"
  weightKg, bodyFatPct            // from latest body entry (Navy)
  heightCm, age?                  // age optional (Mifflin fallback)
  activityLevel
  targetBodyFatPct
  profile: "conservative"|"optimal"|"aggressive"   (default "optimal")
  startDate: dateKey
  settings: GoalSettings
  tdeeOverride?: number
}
```

## Step 1 — body composition
```
fatMass = weight × bf/100
leanMass = weight − fatMass
```
## Step 2 — how much fat to lose (lean mass preserved)
Target weight when lean mass is unchanged: `targetWeight = leanMass / (1 − t/100)`.
```
fatToLose = weight − targetWeight = weight × (bf − t) / (100 − t)
```
Worked example (from the product brief): 103 kg at 10 % → 7 %: lean 92.7 → target 99.68 kg → **3.32 kg** fat.
If `leanLossFraction` (settings) > 0, expected total weight loss = fatToLose / (1 − leanLossFraction) and the
report shows both. The "average weight" view from the brief is exposed as
`avgWeight = (weight + targetWeight)/2` and `pctChange = totalLoss / avgWeight × 100` (informational).

## Step 3 — total energy
```
totalDeficitKcal = fatToLose × kcalPerKgFat        (default 7700; brief used 7000 → admin can set)
```
## Step 4 — safe weekly rate (research-refined; re-evaluated every simulated week)
Four caps, the smallest wins (`limitedBy` records which):
```
band = rateTable.find(r => r.sex === sex && bf >= r.bfMin && bf < r.bfMax)     // bfMax exclusive
rateFromTable = weight × band[`${profile}PctBwPerWeek`] / 100
capAbsolute   = band.maxKgPerWeek
capAlpert     = fatMass × alpertKcalPerKgFatPerDay × alpertSafetyFactor × 7 / kcalPerKgFat   // 69.3 × 0.75
capRelative   = maxRelativeDeficitPct × tdee × 7 / kcalPerKgFat                                // 30 % of TDEE
rate          = min(rateFromTable, capAbsolute, capAlpert, capRelative)
```
Seed table: **16 bands** (8 per sex) from `docs/research/fat-loss-science.md` §9 — already encoded in
`packages/core/src/schemas/settings.ts` (`DEFAULT_RATE_TABLE`) with notes + source URLs. Worked check: 103 kg @ 10 % → fat
10.3 kg → Alpert cap (with 0.75) = 10.3×69.3×0.75×7/7700 = **0.49 kg/wk**; table (male 8–12 %, optimal 0.5 %) = 0.515 → Alpert binds.

## Step 5 — energy expenditure
```
bmrKatch   = 370 + 21.6 × leanMass
bmrMifflin = 10w + 6.25h − 5age + (male ? 5 : −161)          (only if age known)
bmr        = age ? bmrBlendKatchWeight × bmrKatch + (1 − w) × bmrMifflin : bmrKatch
tdeeFormula = bmr × activityMultipliers[activityLevel]
tdee        = tdeeOverride ?? tdeeFormula
```
## Step 6 — daily target for a week with rate r (kg/wk)
```
weeklyDeficit = r × kcalPerKgFat ; dailyTarget = tdee − weeklyDeficit/7
floor = max(calorieFloor[sex], bmr × minBmrFactor, tdee × minTdeeFactor)
if dailyTarget < floor → dailyTarget = floor ; r = (tdee − floor) × 7 / kcalPerKgFat ; warning FLOOR_LIMITED
band(bf) = lean (bf < leannessBands[sex].lo) | mid (< hi) | high
proteinG = max(protein[band]GPerKgLean × leanMass, protein.floorGPerKgBodyweight × weight)
fatG     = fatPctOfCalories × dailyTarget / 9
carbsG   = max(50, (dailyTarget − 4·proteinG − 9·fatG) / 4)
```
## Step 7 — roadmap simulation (week by week until bf ≤ target or 104 weeks)
```
state = { weight, bf, fatMass, leanMass }
for week i = 0..:
  r = rateFor(state)                       // step 4 with current bf
  daily = dailyTargetFor(r)                // step 6
  lossKg = min(r, remainingWeightToTarget)
  fatLost = lossKg × fatFractionOfLoss[band(bf)]     // 1.0 high / 0.9 mid / 0.8 low leanness
  (a-priori adaptation only when no tdeeOverride: tdee −= adaptation.kcalPerDayPerKgLost × lossKg, plus adaptivePctPerWeek × tdee0 per week capped at adaptiveCapPct)
  push { weekIndex: i+1, startKey, endKey, startWeightKg, endWeightKg, startBfPct, endBfPct, rateKgPerWeek: lossKg, weeklyDeficitKcal, dailyCalorieTarget, cumulativeDeficitKcal, macros }
  state.weight −= lossKg; state.fatMass −= fatLost; state.leanMass = weight − fatMass; state.bf = fatMass/weight×100
estimatedWeeks = roadmap.length ; targetDate = startDate + 7×weeks
```
`GoalPlan = { fatToLoseKg, targetWeightKg, totalDeficitKcal, avgWeightKg, pctChange, bmr, tdee, tdeeFormula, activityLevel, initialRateKgPerWeek, initialDailyCalorieTarget, macros, estimatedWeeks, targetDate, roadmap[], warnings[] }`

Warnings: `TARGET_ABOVE_CURRENT`, `TARGET_TOO_LOW` (male < 5, female < 12 — essential fat), `FLOOR_LIMITED`,
`LONG_HORIZON` (> 52 weeks), `NO_BODY_ENTRY`.

## Progress (GoalProgress) — computed from real data
```
weeksElapsed = floor(days/7); expected = roadmap[min(weeksElapsed, last)] interpolated by day
actualWeight = EWMA(weighIns, alpha) latest value
deficitBanked = Σ over elapsed days of (tdeeUsed − intakeKcal) for days with ≥1 meal entry  (days without logging count 0)
percentComplete = clamp((startWeight − actualWeight) / (startWeight − targetWeight), 0, 1) × 100   (weight-based, EWMA)
onTrack: diff = actualWeight − expectedWeight (kg)
  ahead ≤ −0.4 · onTrack |diff| < 0.4 · behind ≥ 0.4 · stalled if weeksElapsed ≥ 2 and EWMA change over last 14 d > −0.1 kg
projectedDate = now + (actualWeight − targetWeight)/observedRate weeks where observedRate = EWMA slope over last 28 d (fallback plan rate)
```

## Recalibration (measured TDEE, MacroFactor-style)
```
window = last recalibration.windowDays (21) days, excluding the first recalibration.settlingDays (10) after goal start;
        requires ≥ minDays (14) days and intake logged ≥ minIntakeDaysPerWeek (5) per week → else `applied: false, reason`
avgIntake = mean(kcal per logged day)
Δw = EWMA(end) − EWMA(start)                       // trend weight, never raw
tdeeObserved = avgIntake − Δw × kcalPerKgFat / windowDays
clamp tdeeObserved to sanityBounds × tdeeFormula ([0.65, 1.45])
tdeeNew = tdeePrev + dampingBeta × (tdeeObserved − tdeePrev)       // β 0.3
tdeeNew = clamp(tdeeNew, tdeePrev ± maxWeeklyChangeKcal)           // ±150
→ goal.tdeeOverride = tdeeNew ; plan re-simulated from current state (start preserved, no a-priori adaptation)
```
EWMA: `alpha` 0.1 (sparseAlpha 0.25 when < 5 weigh-ins/week); time-aware for gaps `α_eff = 1 − (1 − α)^days`; reject a
weigh-in that deviates > outlierRejectKg (3 kg) from the trend as a spike (kept in raw series, excluded from trend).
UI shows `bodyFatUncertaintyPct` (±3.5) on the current BF% and tracks progress primarily by trend weight + waist.

## Tests (write first)
- fatToLose: 103/10→7 = 3.32; 80/25→15 = 9.41; target ≥ current → warning + 0.
- rate: band lookup edges (bf exactly at boundary → lower band exclusive of max), Alpert cap dominates for very lean
  (e.g. 70 kg at 6 %: fatMass 4.2 → 4.2×69×7/7700 = 0.26 kg/wk < table 0.35×70/100 = 0.245? → min).
- floor: female 55 kg, sedentary, aggressive → dailyTarget below 1200 → FLOOR_LIMITED and rate reduced.
- roadmap monotonic: weight & bf strictly decreasing; last week ends at target; sum of losses = fatToLose ± 0.01.
- horizon cap 104 weeks + LONG_HORIZON warning.
- recalibration: avgIntake 2000, Δw −0.5 kg over 14 d → observed 2275; blend → 0.5×2275+0.5×formula.
- progress: on-track classification table-driven cases; deficitBanked ignores unlogged days.
