# B1 — Platform module (auth ✔ done by orchestrator, admin, settings, catalogs, seed/migration)

Model: Opus (high effort). Read `COMMON.md` first. Plan docs: `01-data-model.md`, `02-api-contract.md` (Auth, Admin, Catalog),
`04-training-recovery.md` (for template weekly volume), `09-mascot.md`.

## You own
- `apps/api/src/modules/platform/**` (auth routes already exist — extend, don't rewrite)
- `apps/api/src/models/user.ts`, `settings.ts`, `muscle.ts`, `exercise.ts`, `mascot.ts`, and the `ProgramTemplate` half of `program.ts`
- `apps/api/src/seed/**` (index.ts + data/*)
- `apps/api/test/platform*.test.ts`, `apps/api/test/seed*.test.ts`
- `apps/api/README.md`

## Deliverables (all with tests first)
1. **Admin users**: `GET/POST /admin/users`, `GET/PATCH/DELETE /admin/users/:id`, `POST /admin/users/:id/reset-password`,
   `POST /admin/users/:id/assign-program {templateId}` (copies template days into the user's `Program` doc: create or replace, pointer 0,
   weekNumber 1, `sourceTemplateId`), `GET /admin/users/:id/overview` (user, program, latest body entry, active goal, last 5 workouts,
   current week report **if** `apps/api/src/modules/body/reports.service.ts` exports `buildWeeklyReport(userId, weekKey)` — check at runtime
   with a dynamic import and return `null` if absent so you never block on B3). DELETE cascades: programs, workoutLogs, bodyEntries,
   weighIns, goals, weeklyReportCache, mealEntries, dietTargets, scans (use the models directly). `AdminUserDTO` adds `hasProgram`,
   `goalStatus`. Admin cannot delete themselves. Usernames unique → `409 CONFLICT`.
2. **Settings**: `GET/PUT /admin/settings` → validate with `zSettings`, run `validateRateTable`, store singleton (`Settings` model,
   `_id: "global"`). `getSettings()` helper already exists in the model file — keep it the single read path.
3. **Muscles** (admin CRUD + `PUT /admin/muscles/order`) and public `GET /muscles` (active, ordered). Deleting a muscle that is referenced by
   any exercise → `409 CONFLICT` (offer `active: false` instead). Key immutable.
4. **Exercises** (admin CRUD, `?q=&muscle=` filters, unique case-insensitive name via `nameKey`) and public `GET /exercises?q=`.
   Validate every `muscles[].key` exists (active or not).
5. **Program templates** (`/admin/program-templates` CRUD + `/:id/duplicate`). Validate days with `zProgramTemplateInput`, normalize orders to
   1..N, and compute `weeklyVolume: Record<muscleKey, sets>` per template = Σ over days of `targetSets × load` per muscle (cycle-based; for a
   7-day cycle it equals weekly). Put the pure function in `packages/core/src/training/volume.ts` **only if B2 hasn't created it yet** —
   check first; if it exists, import it. (B2 owns `packages/core/src/training/`; coordinate by using their export if present, otherwise create
   `packages/core/src/training/templateVolume.ts` with your own small function and export it from `packages/core/src/training/index.ts` by
   appending one line.)
6. **Mascot messages** admin CRUD + `POST /admin/mascot-messages/reset` (re-seeds from `DEFAULT_MASCOT_MESSAGES` in core). Keys must be in
   `MASCOT_KEYS`.
7. **Dashboard** `GET /admin/dashboard` per contract (counts via `countDocuments`, 14-day series via one `$group` aggregation per collection on
   `dateKey`/`createdAt`).
8. **System health** `GET /admin/system/health` → db state + `createVisionClient(ctx).health()` from `apps/api/src/modules/vision/index.ts` +
   `version` from `apps/api/package.json`.
9. **Seed & migration** (`apps/api/src/seed/index.ts` → `runSeed()`), idempotent, layered, never destructive:
   - users `eren` (admin, male, 178 cm, password `Asd*123`) and `inci` (user, female) if missing; drop legacy `passwordPlain` field via
     `$unset`; backfill `activityLevel/measurementDay/mascotEnabled` where missing.
   - muscles, exercises, templates from `seed/data`, settings singleton, mascot messages (insert if collection empty).
   - programs: for eren/inci without a program, create from the matching template (`EREN_DAYS` / `INCI_DAYS`).
   - legacy migration: `programs.days[].exercises[].muscles` and `workoutlogs.strength[].muscles` from `string[]` → `[{key, load: 1}]`
     (only when the first element is a string); `workoutlogs` missing `dateKey` → derive with `trDateKey(date)`;
     `dietTargets` missing `mode` → `"manual"`; `bodyentries` missing `dateKey` → derive.
   - foods: call `seedFoods()` exported from `apps/api/src/modules/nutrition/seed/index.ts` **if it exists** (dynamic import in try/catch; B4 creates it).
   - Tests: run twice → same counts; legacy-shaped docs get migrated; existing users untouched.
10. Keep `pnpm --filter @fitfloow/api test` green including `test/auth.test.ts`.

## Notes
- Admin routes: `preHandler: [app.requireAdmin]`. User routes: `[app.authenticate]`.
- Use `AppError.notFound()`, `AppError.conflict()`. Validation: `schema: { body: zX, params: z.object({ id: zId }) }`.
- `apps/api/src/modules/platform/index.ts` is where you register everything.

## Status (append below)

---

### Status — B1 (platform) · 2026-09-10

**Done — every deliverable in the brief is implemented and tested (TDD: test → route → refactor).**

Routes (all under `/api/v1`, admin ones behind `preHandler: [app.requireAdmin]` → 403 `FORBIDDEN`):

| area | routes | file |
|---|---|---|
| catalog (users) | `GET /muscles`, `GET /exercises?q=` (active only, ordered) | `modules/platform/catalog.routes.ts` |
| admin users | `GET/POST /admin/users?q=`, `GET/PATCH/DELETE /admin/users/:id`, `POST /:id/reset-password`, `POST /:id/assign-program`, `GET /:id/overview` | `admin.users.routes.ts` + `users.service.ts` |
| settings | `GET/PUT /admin/settings` | `admin.settings.routes.ts` |
| muscles | `GET/POST /admin/muscles`, `PATCH/DELETE /admin/muscles/:key`, `PUT /admin/muscles/order` | `admin.muscles.routes.ts` |
| exercises | `GET/POST /admin/exercises?q=&muscle=`, `GET/PATCH/DELETE /admin/exercises/:id` | `admin.exercises.routes.ts` |
| templates | `GET/POST /admin/program-templates`, `GET/PATCH/DELETE /:id`, `POST /:id/duplicate` | `admin.templates.routes.ts` |
| mascot | `GET/POST /admin/mascot-messages`, `PATCH/DELETE /:id`, `POST /admin/mascot-messages/reset` | `admin.mascot.routes.ts` |
| dashboard | `GET /admin/dashboard` (counts + 14-day series, one aggregation per collection) | `admin.dashboard.routes.ts` |
| health | `GET /admin/system/health` (db + vision probe + package version + uptime) | `admin.system.routes.ts` |

Behaviour worth knowing:
- `AdminUserDTO` carries `hasProgram` + `goalStatus`; both come from **two batch queries** for the whole list (no N+1).
  `goalStatus` prefers the **active** goal, else the most recent one (same rule in `/overview`).
- `DELETE /admin/users/:id` cascades programs, workoutLogs, bodyEntries, weighIns, goals, weeklyReportCache,
  mealEntries, dietTargets, scans; refuses to delete the acting admin (403). Duplicate usernames → 409 `CONFLICT`
  (pre-check *and* a duplicate-key guard, so a double-submit yields 201 + 409, never a 500).
- `assign-program` upserts the user's single program from a template (days copied, pointer 0, week 1, `sourceTemplateId`).
- `/overview` resolves B3's `buildWeeklyReport(userId, weekKey)` through a **runtime dynamic import** of
  `modules/body/reports.service.js`; missing module or export → `weekReport: null` (verified both ways, never blocks).
- `PUT /admin/settings` is a full replace validated by `zSettings` **and** `validateRateTable` (problems → 400 with
  `details`); `getSettings()` stays the only read path.
- Muscle keys are immutable (`zMuscleUpdate` omits `key`); deleting a muscle referenced by an exercise → 409 with a
  "make it passive instead" message; `PUT /admin/muscles/order` requires the complete key set.
- Exercises: unique case-insensitive `nameKey`; every `muscles[].key` must exist in the catalog (active or not) → 400.
- Templates: day orders normalized to 1..N, exercise defaults filled (`metric: "reps"`, `targetRIR: null`, `muscles: []`),
  and `weeklyVolume` computed by core.
- Mascot keys are restricted to `MASCOT_KEYS`; the list is returned in catalog order; `reset` re-seeds `DEFAULT_MASCOT_MESSAGES`.

Seed (`src/seed/index.ts`, `runSeed(): Promise<SeedReport>`, idempotent + layered + non-destructive):
users eren/inci (v1 password `Asd*123`, `passwordPlain` dropped, `activityLevel`/`measurementDay`/`mascotEnabled` backfilled)
→ catalogs + settings + mascot messages (insert only when the collection is empty) → programs for eren/inci from the
matching template → v1 migrations (`muscles: string[] → [{key, load:1}]` in programs and workout logs, missing `dateKey`
derived with `trDateKey(date)` for workout logs and body entries, `dietTargets.mode → "manual"`) → `seedFoods()` from
B4's nutrition seed if that module exists (dynamic import in try/catch). It returns a report of what it created/migrated.

**Tests — 60 new API tests, all green** (`pnpm --filter @fitfloow/api test`):
`test/platform.test.ts` 21 · `test/platform.catalog.test.ts` 14 · `test/platform.admin.test.ts` 9 ·
`test/platform.templates.test.ts` 8 · `test/seed.test.ts` 8. `test/auth.test.ts` (11) still passes untouched.
`pnpm --filter @fitfloow/api typecheck` is clean for every file B1 owns.

**Core**: `packages/core/src/training/volume.ts` did not exist when I started, so per the brief I added
`packages/core/src/training/templateVolume.ts` (`templateWeeklyVolume`, 4 unit tests) and appended one export line to
`training/index.ts`. B2 has since built `templateVolume()` on top of it (excludes mobility work) — the admin template
routes now call **B2's** `templateVolume`, so admin and training report the same numbers.

**Two things for the orchestrator**

1. 🔴 **The API cannot boot outside vitest** (`pnpm dev:api`, `pnpm --filter @fitfloow/api start`, `pnpm seed` all crash):
   `SyntaxError: The requested module 'mongoose' does not provide an export named 'models'`. Mongoose 9 is CJS and Node's
   ESM lexer does not expose `models` as a named export (Vite/vitest papers over this, which is why every suite is green).
   Fix per file: `import mongoose, { Schema, model, … } from "mongoose"` + `mongoose.models.X`.
   I applied it to the model files I own (`user.ts`, `settings.ts`, `muscle.ts`, `exercise.ts`, `mascot.ts`, `program.ts`).
   **Still broken (owners must apply the same one-line change):** `models/workoutLog.ts` (B2), `models/body.ts` and
   `models/goal.ts` (B3), `models/nutrition.ts` (B4). Verified with a tsx smoke run: after fixing mine the crash moves to
   `workoutLog.ts`, and `runSeed()` itself is fine under tsx.
2. `/admin/foods*` and `/admin/scans` are listed in the contract as "B4 implements, B1 mounts". B4's nutrition module is
   already registered from `app.ts`, so no mount hook was added — B4 should register those admin routes inside
   `modules/nutrition/index.ts`. Nothing else in the platform surface depends on them.

**Known gaps / notes**
- Catalog seeding is deliberately insert-only-when-empty: a muscle or exercise an admin deleted is never resurrected.
- Dashboard aggregates `workoutlogs`/`mealentries` by `dateKey` across all users; those collections' indexes are
  `{userId, dateKey}` (B2/B4 own them). If the dashboard ever gets slow, a plain `{dateKey: 1}` index there is the fix.
- Indexes added to owned models: `users.refreshTokens.tokenHash`, `users.lastSeenAt`, `muscles.order`,
  `muscles.{active,order}`, `exercises.muscles.key`, `exercises.{active,name}`.
- `apps/api/README.md` documents run/env/routes/seed/tests.
- Other agents' suites at the time of writing: `test/body.test.ts` (B3) is red (routes not implemented yet) and
  `test/vision-contract.test.ts` (B5) has a typecheck error — both outside B1's ownership, left untouched.
