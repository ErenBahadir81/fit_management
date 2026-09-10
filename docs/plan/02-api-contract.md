# 02 — API Contract (`apps/api`, base path `/api/v1`)

Conventions
- JSON everywhere. Success: the resource/composite object directly. Error: `{ error: { code, message, details? } }`.
- Auth: `Authorization: Bearer <accessToken>` (mobile) **or** cookie `fit_access` (admin web). Access token
  TTL 15 min, refresh 30 days (rotating). Admin-only routes require `role === "admin"` → else `403 FORBIDDEN`.
- Validation with zod (`@fitfloow/core` schemas). Invalid input → `400 VALIDATION` with zod issues in `details`.
- Dates: ISO strings; day keys `YYYY-MM-DD` (Türkiye local day). Query `date=` defaults to today (TR).
- Pagination: `?limit=&before=<ISO|id>` cursor style where lists can grow.
- Rate limit: 300 req/min per user, 20 req/min for `/auth/login` per IP, 30/min for `/nutrition/scan`.
- Swagger UI at `/docs` (dev only).

## Auth & profile (module B1)
| Method | Path | Body → Response |
|---|---|---|
| POST | /auth/login | `{username,password}` → `{accessToken, refreshToken, user: UserDTO}` (also sets `fit_access`/`fit_refresh` httpOnly cookies when `?cookie=1`) |
| POST | /auth/refresh | `{refreshToken}` (or cookie) → `{accessToken, refreshToken}` |
| POST | /auth/logout | `{refreshToken?}` → 204 (revokes; clears cookies) |
| GET | /auth/me | → `{user: UserDTO}` |
| PATCH | /me | `UpdateMeInput` (displayName, gender, heightCm, birthDate, activityLevel, measurementDay, mascotEnabled) → `{user}` |
| PATCH | /me/password | `{currentPassword,newPassword}` → 204 |

`UserDTO = { id, username, displayName, role, gender, heightCm, birthDate, activityLevel, measurementDay, mascotEnabled, createdAt }`

## Admin (module B1)
| Method | Path | Notes |
|---|---|---|
| GET | /admin/dashboard | `{users: n, activeUsers7d, workouts7d, meals7d, scans7d, goalsActive, series: [{dateKey, workouts, meals, scans}] (14 days)}` |
| GET/POST | /admin/users | list (`?q=`) / create `{username, displayName, password, role, gender, heightCm, ...}` |
| GET/PATCH/DELETE | /admin/users/:id | PATCH may include `password` (re-hash). DELETE cascades user data. |
| GET | /admin/users/:id/overview | `{user, program, latestBody, goal, lastWorkouts(5), weekReport}` |
| POST | /admin/users/:id/assign-program | `{templateId}` → `{program}` |
| POST | /admin/users/:id/reset-password | `{password}` → 204 |
| GET/PUT | /admin/settings | `SettingsDTO` (full replace on PUT; validated) |
| GET/POST | /admin/muscles · PATCH/DELETE /admin/muscles/:key · PUT /admin/muscles/order `{keys[]}` | |
| GET/POST | /admin/exercises · GET/PATCH/DELETE /admin/exercises/:id | `?q=&muscle=` |
| GET/POST | /admin/program-templates · GET/PATCH/DELETE /:id · POST /:id/duplicate | PATCH replaces `days` wholesale; response includes `weeklyVolume: Record<muscleKey, sets>` computed by core |
| GET/POST | /admin/mascot-messages · PATCH/DELETE /:id · POST /admin/mascot-messages/reset | |
| GET/POST | /admin/foods · PATCH/DELETE /:id · POST /admin/foods/import `{query, source:"off"|"usda", limit}` → imported foods | (B4 implements handlers, B1 mounts) |
| GET | /admin/scans `?limit=` | recent scans with detections (B4) |
| GET | /admin/system/health | `{db:"ok", vision:{ok, mock, modelVersion, latencyMs}, version}` (B5 vision probe) |

## Catalog (read-only for users) (B1)
- GET /muscles → `{muscles: MuscleDTO[]}` (active, ordered)
- GET /exercises `?q=` → `{exercises: ExerciseDTO[]}`

## Training (module B2)
| Method | Path | Body → Response |
|---|---|---|
| GET | /program | `{program: ProgramDTO, current: {index, day}, todayLog: WorkoutLogDTO\|null, schedule: ScheduleEntry[7], weeklyVolume: Record<key, {done, target}>}` |
| PUT | /program | `{name?, days: DayInput[]}` → `{program}` (validates via core; keeps pointer in range) |
| POST | /program/jump | `{index}` → `{program}` |
| POST | /program/complete | `CompleteWorkoutInput` (strength entries with sets, run/swim segments, durationMin, notes) → `{log, program}` (advances pointer; cardio target progression) |
| POST | /program/skip | `{reason?}` → `{log (isOffDay), program}` |
| POST | /program/undo-last | → reverts last complete/skip of today (deletes log, moves pointer back) |
| GET | /workouts `?from&to&limit&before` | `{logs}` newest first |
| GET/PATCH/DELETE | /workouts/:id | edit sets after the fact |
| GET | /recovery | `{muscles: MuscleReadiness[], overall: {readiness, status, readyCount, fatiguedCount}, generatedAt}` |
| GET | /training/stats `?weeks=8` | `{weeks: [{weekKey, sessions, sets, volumeByMuscle}], streakDays, totalSessions, prs: {...}}` |

## Body (module B3)
| Method | Path | Body → Response |
|---|---|---|
| GET | /body/entries `?limit=` | `{entries: BodyEntryDTO[] (asc), profile: {gender, heightCm}}` |
| POST | /body/entries | `BodyEntryInput {gender?, heightCm, neckCm, waistCm, hipCm?, weightKg, date?, notes?}` → `{entry}` (also upserts weighIn; invalidates week report) |
| PATCH/DELETE | /body/entries/:id | |
| GET | /body/weighins `?days=90` | `{weighIns: WeighInDTO[] asc}` |
| POST | /body/weighins | `{weightKg, dateKey?}` → `{weighIn}` (upsert per day) |
| DELETE | /body/weighins/:id | |
| GET | /body/trends `?days=90` | `{points: [{dateKey, weightKg?, weightEwma?, bodyFatPct?, leanMassKg?, waistCm?}], summary: {weightDelta7d, weightDelta30d, bfDelta30d}}` |
| GET | /body/summary | `{latest, prev, deltas, category, leanMassKg, fatMassKg}` |

## Goals (module B3)
| Method | Path | Body → Response |
|---|---|---|
| GET | /goals/current | `{goal: GoalDTO\|null, progress: GoalProgress\|null}` |
| POST | /goals/preview | `{targetBodyFatPct, profile?}` → `{plan: GoalPlan, warnings: string[]}` (no save; uses latest body entry) |
| POST | /goals | `{targetBodyFatPct, profile?}` → `{goal}` (fails `409 GOAL_EXISTS` if active) |
| PATCH | /goals/current | `{targetBodyFatPct?, profile?}` → recompute plan from *current* state; keeps start |
| POST | /goals/current/recalibrate | → `{goal, recalibration: {tdeeFormula, tdeeObserved, tdeeUsed, daysUsed}}` |
| POST | /goals/current/complete · /abandon | → `{goal}` |

`GoalProgress = { daysElapsed, weeksElapsed, expectedWeightKg, actualWeightKg (EWMA), expectedBodyFatPct, actualBodyFatPct, deficitBankedKcal, deficitPlannedKcal, percentComplete, onTrack: "ahead"|"onTrack"|"behind"|"stalled", projectedDate, weeksRemaining }`

## Reports (module B3)
| Method | Path | Response |
|---|---|---|
| GET | /reports/weekly `?week=YYYY-MM-DD` | `WeeklyReportDTO` (see 06-weekly-report.md) |
| GET | /reports/weekly/history `?limit=12` | `{weeks: WeeklyReportSummary[]}` |
| GET | /reports/home | `HomeDTO = { user, today: {dateKey, weekday, workout: {day, log}, calories: {target, eaten, remaining}, protein}, recovery: {overall, top3}, goal: GoalProgress\|null, week: {weekKey, dayIndex, deficitBanked, onTrack}, streaks: {workout, logging}, mascot: {mood, text} }` — single call for the home screen |

## Nutrition (module B4)
| Method | Path | Body → Response |
|---|---|---|
| GET | /nutrition/day `?date=` | `{dateKey, target: DietTargetDTO, totals, meals: {breakfast: MealEntryDTO[], lunch, dinner, snack}, mealTotals}` |
| POST | /nutrition/entries | `CreateMealEntryInput {dateKey?, meal, foodId?, custom?: {name, per100g}, grams, source, scanId?}` → `{entry, dayTotals}` |
| PATCH/DELETE | /nutrition/entries/:id | `{grams?, meal?}` |
| GET | /nutrition/foods/search `?q=&limit=&remote=0|1` | `{foods: FoodDTO[], remote: FoodDTO[] (OFF results when remote=1)}` |
| GET | /nutrition/foods/:id | |
| POST | /nutrition/foods | user-private custom food |
| GET | /nutrition/foods/barcode/:code | local → OFF fallback; caches into foods |
| GET | /nutrition/recent | `{foods: FoodDTO[]}` last 20 distinct |
| POST | /nutrition/scan | multipart `image` → `ScanResultDTO {scanId, imageUrl, detections: [{label, labelTr, confidence, food: FoodDTO\|null, suggestedGrams}], mock, latencyMs}` |
| GET | /nutrition/week `?week=` | `{days: [{dateKey, totals, target}], avg, adherence}` |
| GET/PUT | /nutrition/target | `DietTargetDTO {mode, calories, protein, carbs, fat, derivedFrom?: "goal"}` |

## Mascot (module B3)
- GET /mascot/message `?context=home|report|scan|workout|body|goal` → `{mood, text}` (server picks by user state; templated)

## Health
- GET /health → `{ok: true, uptime, db}`
