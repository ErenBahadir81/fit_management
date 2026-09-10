# @fitfloow/api

Fastify 5 + TypeScript + Mongoose 9 service behind every FitFloow surface (mobile, admin panel).
Base path: **`/api/v1`**. Contract: [`docs/plan/02-api-contract.md`](../../docs/plan/02-api-contract.md).

## Run

```bash
pnpm --filter @fitfloow/api dev        # tsx watch (needs MONGO_URI, or MONGO_MEMORY=1)
pnpm --filter @fitfloow/api start      # single run
pnpm seed                              # idempotent seed + migration against MONGO_URI
pnpm --filter @fitfloow/api test       # vitest + in-memory MongoDB
pnpm --filter @fitfloow/api typecheck
```

`MONGO_MEMORY=1` boots a throwaway mongod (mongodb-memory-server) so the API runs with no local
database. Swagger UI is mounted at `/docs` in development only.

### Environment (`.env.example`)

| var | default | notes |
|---|---|---|
| `PORT` / `HOST` | 4000 / 0.0.0.0 | |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/fitfloow` | |
| `MONGO_MEMORY` | 0 | 1 → in-memory mongod, ignores `MONGO_URI` |
| `JWT_SECRET` | — | required, ≥ 16 chars |
| `ACCESS_TTL_MIN` / `REFRESH_TTL_DAYS` | 15 / 30 | access token + rotating refresh token |
| `CORS_ORIGINS` | admin + expo dev hosts | comma separated, `*` allowed |
| `VISION_URL` / `VISION_MOCK` | `http://127.0.0.1:8100` / 0 | `VISION_MOCK=1` → deterministic fake detections |
| `UPLOAD_DIR` | `./uploads` | scan images |
| `SEED_ON_BOOT` | 1 | runs `runSeed()` after connecting |
| `COOKIE_SECURE` | 0 | set to 1 behind HTTPS |

## Layout

```
src/
  app.ts            Fastify wiring (cors, rate limit, jwt/cookies, zod compilers, modules)  — orchestrator owned
  config.ts         env → typed config              context.ts  { config, http, now } injected everywhere
  lib/              auth plugin, AppError + error handler, http client, serializers
  models/           Mongoose models + `toXDTO()` mappers
  modules/
    platform/       auth, profile, catalog, /admin/* (users, settings, muscles, exercises,
                    program templates, mascot messages, dashboard, system health)   ← B1
    training/  body/  nutrition/  vision/                                            ← B2/B3/B4/B5
  seed/             runSeed(): idempotent seed + v1 → v2 migration                   ← B1
test/               vitest integration tests (`harness.ts` builds an app on a fresh in-memory db)
```

Conventions: routes stay thin and validate with zod schemas from `@fitfloow/core`; domain math lives in
`packages/core`; errors are thrown as `AppError` and serialized as `{ error: { code, message, details? } }`;
all day/week logic goes through the Türkiye time helpers (`trDateKey`, `weekKeyFor`, …); reads that are only
serialized use `.lean()`.

## Platform module (auth, profile, catalog, admin)

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` `?cookie=1` | 20 req/min per IP; sets `fit_access` / `fit_refresh` cookies when `cookie=1` |
| POST | `/auth/refresh` · `/auth/logout` | rotating refresh tokens (hashed, max 10 devices) |
| GET | `/auth/me` · PATCH `/me` · PATCH `/me/password` | password change revokes every session |
| GET | `/muscles` · `/exercises?q=` | signed-in users; active rows only, muscles in display order |
| GET | `/admin/dashboard` | counts + 14-day `dateKey` series (one aggregation per collection) |
| GET/POST | `/admin/users` `?q=` | `AdminUserDTO` adds `hasProgram`, `goalStatus` |
| GET/PATCH/DELETE | `/admin/users/:id` | PATCH may carry `password`; DELETE cascades every per-user collection and refuses self-deletion |
| GET | `/admin/users/:id/overview` | user + program + latest body entry + goal + last 5 workouts + current week report |
| POST | `/admin/users/:id/assign-program` | copies a template's days into the user's program (pointer 0, week 1) |
| POST | `/admin/users/:id/reset-password` | 204 |
| GET/PUT | `/admin/settings` | full replace, validated with `zSettings` + `validateRateTable` |
| GET/POST | `/admin/muscles` · PATCH/DELETE `/admin/muscles/:key` · PUT `/admin/muscles/order` | key immutable; deleting a referenced muscle → 409 (deactivate instead) |
| GET/POST | `/admin/exercises` `?q=&muscle=` · GET/PATCH/DELETE `/admin/exercises/:id` | case-insensitive unique name (`nameKey`), muscle keys validated |
| GET/POST | `/admin/program-templates` · GET/PATCH/DELETE `/:id` · POST `/:id/duplicate` | day orders normalized to 1..N; response carries `weeklyVolume` (core `templateWeeklyVolume`) |
| GET/POST | `/admin/mascot-messages` · PATCH/DELETE `/:id` · POST `/admin/mascot-messages/reset` | keys restricted to `MASCOT_KEYS`; reset re-seeds `DEFAULT_MASCOT_MESSAGES` |
| GET | `/admin/system/health` | db state + vision probe + package version + uptime |

Admin routes use `preHandler: [app.requireAdmin]` (403 `FORBIDDEN` for users), user routes `[app.authenticate]`
(401 `AUTH_REQUIRED` / `TOKEN_EXPIRED`).

## Seed & migration (`src/seed`)

`runSeed()` runs at boot (`SEED_ON_BOOT=1`) and from `pnpm seed`. It is **idempotent, layered and never
destructive** — every step is skipped when its data already exists, and it returns a `SeedReport` of what it
created/migrated.

1. users: `eren` (admin, male, 178 cm) and `inci` (user, female) with the v1 default password `Asd*123`;
   drops the legacy `passwordPlain` field and backfills `activityLevel` / `measurementDay` / `mascotEnabled`.
2. catalogs (insert only when the collection is empty): muscles, exercises, program templates, mascot
   messages, plus the settings singleton (`_id: "global"`).
3. programs: creates one from the matching template for eren/inci when they have none; an existing program is
   never touched.
4. v1 → v2 migration: `programs.days[].exercises[].muscles` and `workoutlogs.strength[].muscles`
   `string[]` → `[{key, load: 1}]`; missing `dateKey` on workout logs / body entries derived from `date` in
   Türkiye local time; `dietTargets.mode` defaulted to `"manual"`.
5. foods: delegates to `modules/nutrition/seed` (`seedFoods()`) when that module is present.

Seed data lives in `src/seed/data` (`SEED_MUSCLES`, `SEED_EXERCISES`, `SEED_TEMPLATES`, `EREN_DAYS`, `INCI_DAYS`).

## Tests

`test/harness.ts` gives every suite a fresh database on the shared in-memory mongod started by
`test/global-setup.ts`:

```ts
const t = await createTestApp();          // beforeAll
await t.reset(); await seedBasics();      // beforeEach
const { headers } = await asAdmin(t);     // or asUser(t, { gender: "female" })
await t.app.inject({ method: "GET", url: "/api/v1/admin/dashboard", headers });
```

`t.clock.now` is the injected clock (`ctx.now()`), `t.http` a `FakeHttpClient` for upstream calls. Run one
file with `pnpm --filter @fitfloow/api exec vitest run test/platform.test.ts`.
