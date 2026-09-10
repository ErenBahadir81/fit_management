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
