# 01 — Domain & Data Model (MongoDB)

All collections keyed by `_id: ObjectId`, `createdAt/updatedAt` timestamps. `userId` indexed
everywhere it appears. Field names below are canonical; zod schemas in `packages/core/src/schemas`
mirror the DTO (API) shape — `id: string` instead of `_id`, ISO strings for dates.

## users
| field | type | notes |
|---|---|---|
| username | string, unique, lowercase | |
| displayName | string | |
| passwordHash | string (bcrypt) | |
| role | "admin" \| "user" | |
| gender | "male" \| "female" | for Navy + rate table |
| heightCm | number \| null | |
| birthDate | string (YYYY-MM-DD) \| null | for Mifflin (optional) |
| activityLevel | "sedentary" \| "light" \| "moderate" \| "active" \| "veryActive" | default "moderate" |
| measurementDay | 0..6 (0 = Sunday … 6 = Saturday) | default 0 (Sunday). Week + report start |
| mascotEnabled | boolean | default true |
| unitSystem | "metric" | reserved |
| refreshTokens | [{ tokenHash, createdAt, expiresAt, device }] | rotated on refresh |
| lastSeenAt | Date | |
| (legacy) passwordPlain | string \| null | v1 admin panel showed it — **migrated away: field dropped** |

## settings (singleton `_id: "global"`)
```
goal: {
  kcalPerKgFat: 7700,
  alpertKcalPerKgFatPerDay: 69,       // max daily deficit per kg fat mass (Alpert 2005, 31 kcal/lb)
  leanLossFraction: 0.0,              // expected share of weight lost that is lean (0..0.3); planning assumes lean preserved
  calorieFloor: { male: 1500, female: 1200 },
  minBmrFactor: 1.0,                  // daily target never below BMR × factor
  proteinGPerKgLean: 2.2,
  fatGPerKgBodyweight: 0.8,
  activityMultipliers: { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9 },
  ewmaAlpha: 0.1,
  recalibration: { minDays: 14, blendWeight: 0.5 }, // TDEE estimate blend with formula
  rateTable: [ { sex, bfMin, bfMax, conservativePctBwPerWeek, optimalPctBwPerWeek, aggressivePctBwPerWeek, maxKgPerWeek, note } … ]
}
recovery: { small: 48, large: 24 }     // default full-recovery hours (muscle overrides win)
week: { defaultMeasurementDay: 0 }
vision: { enabled: true, minConfidence: 0.15, maxDetections: 5 }
mascot: { name: "Floo" }
```
Admin edits it via `PUT /admin/settings`; core reads a typed `GoalSettings` object.

## muscles (admin-editable, replaces `MUSCLES` const)
| field | type |
|---|---|
| key | string, unique (e.g. "chest") |
| name, short | string (TR) |
| size | "large" \| "small" |
| fullRecoveryHours | number |
| weeklyTarget | { min?: number, max: number } |
| region | "front" \| "back" \| "legs" \| "core" \| "arms" |
| color | hex string |
| order | number |
| active | boolean |

Seed = v1's 7 muscles + extras (biceps, triceps, glutes, hamstrings, calves, lowerBack, forearms) inactive by default.

## exercises (catalog, admin-editable, replaces `EXERCISE_CATALOG`)
| field | type |
|---|---|
| name | string, unique (case-insensitive) |
| muscles | [{ key: string, load: number 0..1 }] — load = fraction of a set counted for that muscle (1 = full) |
| defaultSets, defaultReps | number |
| metric | "reps" \| "time" \| "stretch" |
| kind | "strength" \| "cardio" \| "mobility" |
| equipment | string[] |
| instructions | string (TR) |
| active | boolean |

v1 had `muscles: string[]` (implicit load 1). Migration maps each string to `{key, load: 1}`.

## programTemplates (admin)
Same `days[]` shape as programs (below) + `name`, `description`, `cycleLength = days.length`,
`tags[]`. Admin assigns to a user (copies into the user's `programs` doc, resetting pointer).

## programs (one active per user)
| field | type |
|---|---|
| userId | ObjectId |
| name | string |
| days | Day[] |
| currentIndex | number (0..days.length-1) |
| weekNumber | number |
| startedAt, lastActionAt | Date |
| sourceTemplateId | ObjectId \| null |

`Day = { order, title, focus, kind: "strength"|"run"|"swim"|"stretch"|"rest", exercises: ExerciseTarget[], run: CardioTarget|null, swim: CardioTarget|null }`
`ExerciseTarget = { name, muscles: [{key, load}], targetSets, targetReps, targetRIR|null, metric }`
`CardioTarget = { targetKm, targetMin, label }`

## workoutLogs
Unchanged from v1 plus: `strength[].muscles` becomes `[{key, load}]`, `durationMin`, `notes`, `rpe`.
Index `{ userId: 1, date: -1 }`.

## bodyEntries (full tape measurement)
v1 fields + `notes`. Index `{ userId: 1, date: -1 }`. `bodyFatPct` computed server-side via core `navyBodyFat`.

## weighIns (quick daily weight)
| field | type |
|---|---|
| userId | ObjectId |
| dateKey | YYYY-MM-DD (unique with userId — one per day, upsert) |
| weightKg | number |
| source | "manual" \| "bodyEntry" (auto-created when a full measurement is saved) |

## goals
| field | type |
|---|---|
| userId | ObjectId |
| status | "active" \| "completed" \| "abandoned" |
| targetBodyFatPct | number |
| profile | "conservative" \| "optimal" \| "aggressive" |
| start | { date, weightKg, bodyFatPct, leanMassKg, fatMassKg, bodyEntryId } |
| plan | GoalPlan snapshot (see 03-goal-engine.md): fatToLoseKg, targetWeightKg, totalDeficitKcal, estimatedWeeks, targetDate, bmr, tdee, dailyCalorieTarget, weeklyDeficitKcal, roadmap[] |
| tdeeOverride | number \| null (set by recalibration) |
| history | [{ at, event: "created"|"recalibrated"|"target-changed", snapshot }] |
| completedAt | Date \| null |

Only one `active` goal per user (partial unique index).

## weeklyReports (cache; recomputed on demand)
`{ userId, weekKey, generatedAt, report: WeeklyReport }` — unique `{userId, weekKey}`. Invalidated
(deleted/regenerated) whenever a weigh-in, body entry, workout log or meal entry in that week changes.

## foods
| field | type |
|---|---|
| name | string (TR display) |
| nameEn | string \| null |
| aliases | string[] (search terms, vision labels e.g. "pizza", "kebab") |
| category | string ("tahıl", "et", "süt", …) |
| per100g | { kcal, protein, carbs, fat, fiber? } |
| defaultServingG | number |
| servings | [{ label: "1 dilim", grams }] |
| source | "seed" \| "off" \| "usda" \| "user" \| "admin" |
| barcode | string \| null (unique sparse) |
| externalId | string \| null |
| verified | boolean |
| popularity | number (increments on use) |
| ownerUserId | ObjectId \| null (user-created private foods) |

Text index on `name, nameEn, aliases`. Seeded with ~300 Turkish staples + Food-101 label map.

## mealEntries
| field | type |
|---|---|
| userId | ObjectId |
| dateKey | YYYY-MM-DD |
| meal | "breakfast" \| "lunch" \| "dinner" \| "snack" |
| foodId | ObjectId \| null |
| name | string (denormalized) |
| grams | number |
| per100g | { kcal, protein, carbs, fat } (denormalized snapshot) |
| totals | { kcal, protein, carbs, fat } (grams × per100g / 100, rounded) |
| source | "search" \| "scan" \| "manual" \| "barcode" \| "recent" |
| scanId | ObjectId \| null |
| loggedAt | Date |

Index `{ userId: 1, dateKey: 1 }`.

## dietTargets
`{ userId (unique), mode: "auto"|"manual", calories, protein, carbs, fat }` — in auto mode values are
derived from the active goal (daily target + protein/fat rules); manual overrides.

## scans
`{ userId, imagePath, width, height, detections: [{ label, labelTr, confidence, foodId, suggestedGrams }], modelVersion, latencyMs, mockMode, createdAt }`

## mascotMessages (admin-editable)
`{ key: "home.morning" | "report.onTrack" | …, mood: "happy"|"cheer"|"think"|"sleepy"|"flex"|"worried", variants: string[] (TR, may contain {name}, {kcal}, {weeks} placeholders), active }`

## Migration (idempotent, runs at API boot and via `pnpm seed`)
1. `users`: drop `passwordPlain`; add defaults (`activityLevel`, `measurementDay`, `mascotEnabled`).
2. `muscles`: insert seed muscles if collection empty.
3. `exercises`: insert seed catalog (v1 list converted to `{key, load}`) if empty.
4. `programs.days[].exercises[].muscles` and `workoutlogs.strength[].muscles`: string[] → [{key, load:1}].
5. `settings`: create singleton with defaults from research if missing.
6. `foods`: bulk insert seed foods if empty.
7. `mascotMessages`: insert default catalog if empty.
8. `dietTargets` → keep, set `mode: "manual"` if missing.
