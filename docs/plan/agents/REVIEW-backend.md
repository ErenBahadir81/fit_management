# REVIEW — Backend (adversarial security + correctness pass)

Scope: `apps/api/src/**`, `packages/core/src/**`, `packages/api-client/src/**`.
Reference: `00-master-plan.md`, `02-api-contract.md`, `03-goal-engine.md`, `06-weekly-report.md`.
`apps/mobile` and `apps/admin` were not touched.

Every defect below was reproduced first (failing test), then fixed in place. Regression tests live in
`apps/api/test/review.test.ts` (21 cases) and `packages/core/src/goal/progress.test.ts` (2 cases).

Status after the pass: `@fitfloow/api` **350 passed / 10 skipped**, `@fitfloow/core` **305 passed**,
`@fitfloow/api-client` **9 passed**; typechecks green for api, core, api-client and admin.

---

## HIGH

### H1 — Login rate limit bypassable via a forged `Authorization` header
`apps/api/src/app.ts:47` (before) — `keyGenerator: req => req.headers.authorization ? String(req.headers.authorization).slice(-32) : req.ip`

The bucket was derived from an unauthenticated, client-controlled string. Sending a different
`Authorization` header with every request buys a brand-new bucket, so the 20/min limit on
`POST /auth/login` (02-api-contract) does not constrain a password-guessing attacker at all. The same
hole lets a legitimate user reset the 30/min `/nutrition/scan` bucket by rotating their refresh token
(every rotation yields a new access token → new last-32-chars → new bucket).

**Fixed**: `rateLimitKey()` (`apps/api/src/app.ts:25`) now *verifies* the JWT before trusting it and
keys on `u:<sub>`; anything unverifiable (absent, forged, expired, cookie auth) falls back to
`ip:<ip>`. `/auth/login` is additionally pinned to `login:<ip>` via the exported `LOGIN_RATE_LIMIT`
(`apps/api/src/modules/platform/auth.routes.ts:19`), matching the contract's "per IP".

### H2 — An abandoned goal shadows the active goal in the weekly report and on the home screen
`apps/api/src/modules/body/reports.service.ts:76` (before) — `Goal.findOne(...).sort({ status: 1, createdAt: -1 })`

Mongo sorts the status strings lexicographically: `"abandoned" < "active" < "completed"`. A user who
abandons a goal and starts a new one gets the *abandoned* document back. Reproduced: `/reports/home`
returned `goal: null` (the home code drops a non-active goal) and `/reports/weekly` reported the
abandoned plan's `targetBodyFatPct`, `plannedDailyTarget`, `tdeeUsed` and `expectedWeightEnd` — i.e.
the report silently coached against a dead plan.

**Fixed**: `reports.service.ts:80-93` — still one round trip (`find(...).sort({createdAt:-1}).limit(10)`),
but the winner is chosen in code: active goal first, otherwise the most recent.

---

## MEDIUM

### M1 — `GoalProgress.currentWeek` reads the goal timeline instead of the plan timeline
`packages/core/src/goal/progress.ts:153` (before) — `currentWeek: roadmapWeekAt(roadmap, daysElapsed)`

A recalibration (`POST /goals/current/recalibrate`) or a re-plan (`PATCH /goals/current`) re-simulates
the roadmap from *today*, so `plan.startKey` moves forward while `goal.start.dateKey` stays put.
Everything else in the file already uses `planOffset` (`weekIndexInPlan`, `tdeeAtDay`, `expectedAtDay`);
`currentWeek` did not. Reproduced: 21 days after the goal started, a re-plan yields
`weekIndexInPlan: 1` but `currentWeek.weekIndex: 4` — and `/reports/home` turns `currentWeek` into
today's calorie and protein target, so the user was shown week-4 numbers on day 1 of the new plan.

**Fixed**: `progress.ts:155` uses `planOffset`. Covered in core and end-to-end through `/reports/home`.

### M2 — The live week's cached report is served across the Türkiye day boundary
`apps/api/src/modules/body/reports.service.ts:150` (before)

Cache invalidation is write-driven, but the live week also moves *with the clock*: at TR midnight
`dayIndexToday`, `daysElapsed`, the logging denominator, `days[].logged` and `deficitPlannedKcal`
(= `plannedWeeklyDeficit × daysElapsed / 7`) all change with no write happening. Reproduced: asking for
the current week on Thursday and again on Friday returned `dayIndexToday: 4` both times. 06-weekly-report
requires the current week's report to be live.

**Fixed**: `isCachedReportFresh()` (`reports.service.ts:136`) — a finished week's cache is always
reusable; a live (or future) week's cache is only reusable on the TR day it was generated. Applied to
both `weeklyReport` (:172) and `weeklyHistory` (:191).

### M3 — Goal writes only invalidated the current week
`apps/api/src/modules/body/goals.service.ts` (before: `invalidateWeeksFor(user._id, [todayKey], …)` at 4 sites)

Creating, re-planning, recalibrating or closing a goal rewrites the whole roadmap, which every cached
week embeds (`goal` block, `targetKcal`, `proteinTarget`, `tdeeUsed`, `expectedWeightEnd`, the deficit
part of `score`). Reproduced: after building 4 weeks of history and then `PATCH /goals/current`, three
cached weeks survived with the old plan's numbers.

**Fixed**: new `invalidateAllWeeklyReports(userId)` (`apps/api/src/models/goal.ts:91`) called from all
four goal writes (`goals.service.ts:110,138,174,186`).

### M4 — `bodyEntries` had no `(userId, dateKey)` index
`apps/api/src/models/body.ts:41` (before: only `{userId:1}` and `{userId:1,date:-1}`)

`loadReportBundle`, `currentGoalView` and `bodyTrends` all range-query `userId + dateKey`; none of them
query on `date`. Every report therefore scanned the user's full entry set.

**Fixed**: `BodyEntrySchema.index({ userId: 1, dateKey: 1 })` (`models/body.ts:43`).

---

## LOW

| # | Where | What | Fix |
|---|---|---|---|
| L1 | `auth.routes.ts:88` · `admin.users.routes.ts:114` | Changing `measurementDay` left the cached reports keyed by the old week boundary. 06-weekly-report §Week definition explicitly requires them to be dropped. | Both PATCH paths compare the old/new value and call `invalidateAllWeeklyReports`. |
| L2 | `program.routes.ts:91` · `users.service.ts:107` | `PUT /program` and `assign-program` change the cycle, which drives `training.plannedSessions` and 25 % of the weekly score, but left every cached report untouched. | Both drop the user's cached reports. |
| L3 | `admin.settings.routes.ts:22` | `PUT /admin/settings` changes `kcalPerKgFat`, the EWMA alphas, the rate table and the score inputs — all baked into cached reports for every user. | `WeeklyReportCache.deleteMany({})` after the write. |
| L4 | `body.routes.ts:18` | `GET /body/entries` had an *optional* `limit`, so the default response streamed the user's whole measurement history. | `limit` defaults to the schema max (500); explicit smaller limits unchanged. |
| L5 | `goals.service.ts:198` | `GET /goals/current` loaded every weigh-in the user had ever recorded (`dateKey: {$lte: today}`, no lower bound). | Bounded to the progress window + 120 d of EWMA warm-up, mirroring `loadReportBundle`. |
| L6 | `foods.routes.ts:10` | `?q=` on food search was an unbounded string feeding a (correctly escaped) `$regex` over 150 candidates. | `z.string().max(80)`, matching `/admin/foods/import`. |
| L7 | `app.ts:69` | `@fastify/multipart` limited `fileSize`/`files` but left `fields`/`parts` at the defaults (∞ fields × 1 MB, 1000 parts). | `fields: 5, parts: 10`. |
| L8 | `config.ts:30` | `COOKIE_SECURE` defaulted to `false`, so a production deploy that forgets the env var serves `fit_access`/`fit_refresh` without `Secure`. | Defaults to `NODE_ENV === "production"`; an explicit value still wins. |

---

## Audited, no defect found (regression-tested so it stays that way)

- **IDOR**: every user-scoped `PATCH`/`DELETE`/`GET :id` filters on `req.auth.id` — body entries,
  weigh-ins, meal entries, workout logs, foods, program, goals. All eight cross-user probes return 404
  with the row unmodified (`review.test.ts` "no IDOR").
- **Role escalation**: `PATCH /me` validates with `zUpdateMeInput`, which strips `role`, `username` and
  `passwordHash` (zod objects strip unknown keys). Verified against the stored document.
- **Admin routes** are uniformly behind `app.requireAdmin`; a user token gets 403.
- **Private foods** are invisible to other users in read, search *and* as a `foodId` on a meal entry.
- **Scan images**: `GET /uploads/scans/:userId/:file` enforces owner-or-admin, and `scanImagePath`
  whitelists both segments (`^[A-Za-z0-9_-]+$` / `^[A-Za-z0-9_-]+\.jpg$`), so `..%2F…` cannot escape
  `UPLOAD_DIR`; a non-`.jpg` name is a 404.
- **ObjectId casting**: every `:id` route pre-checks `Types.ObjectId.isValid` and returns 404 (400 for
  the `?before=` cursor). Nine probes, no 500.
- **Regex injection**: `escapeRegex` is applied at all seven `$regex` / `new RegExp` sites
  (`users.service.ts`, `catalog.routes.ts`, `admin.exercises.routes.ts`, `admin.routes.ts`,
  `foods.service.ts`).
- **NoSQL injection via query params**: Fastify's default querystring parser produces flat strings and
  every route has a zod `querystring`/`params`/`body` schema, so `?q[$ne]=` cannot reach a filter.
- **Türkiye time**: no local-time date maths anywhere — `trDateKey`/`trWeekday`/`shiftKey`/`keyWeekday`
  are all epoch + `getUTC*` with the fixed +03:00 offset; `weekKeyFor` is correct across month and year
  boundaries (existing core tests cover the wrap).
- **Goal engine vs 03-goal-engine.md**: four caps with `limitedBy`, the three-way floor with rate
  reduction + `FLOOR_LIMITED`, protein/fat/carb macros, roadmap termination (`bf ≤ target`, zero rate,
  `maxWeeks` + `LONG_HORIZON`), recalibration clamps (`sanityBounds`, `dampingBeta`,
  `maxWeeklyChangeKcal`) all match the spec.
- **Diet target auto mode** picks the roadmap week containing today by dateKey (`pickRoadmapWeek`),
  clamped at both ends — correct.
- **Composite endpoints** (`/reports/home`, `/program`, `/admin/dashboard`, `/admin/users/:id/overview`)
  are one query per collection in `Promise.all`; no N+1.
- **Mongoose 9**: no `new: true` anywhere — every update uses `returnDocument: "after"`.
- **Seed** is idempotent and non-destructive (existence checks + `$setOnInsert` + duplicate-key
  tolerance).

## Known, not fixed (deliberate — out of scope or not worth the churn)

- **Refresh tokens rotate but there is no reuse detection**: replaying a rotated token is a 401, but it
  does not revoke the token family. Adding family revocation changes the auth data model; flagged for a
  follow-up rather than done here.
- **Concurrent `POST /auth/refresh` race**: two simultaneous refreshes both load the user document and
  can both succeed, leaving two live tokens. Needs an atomic `$pull`+`$push` (or a version guard) —
  same follow-up.
- **`POST /nutrition/entries` accepts a `scanId` belonging to another user.** It is stored verbatim and
  never dereferenced across users, so nothing leaks; validating it would cost a lookup per entry.
- **`GET /admin/users?q=` is unbounded** (no limit/pagination). Admin-only, and the contract does not
  define a cursor for it.
- **`GET /exercises` and `GET /muscles` return the whole catalog** with no limit — admin-curated data
  measured in tens of rows; a limit would break the mobile catalog cache.
- **The global rate-limit bucket is per user id**, so a caller holding a valid token for user X could
  burn X's own quota. Keying on the verified subject is the intended behaviour (02-api-contract:
  "300 req/min per user"); the previous forgeable key was the actual defect.
