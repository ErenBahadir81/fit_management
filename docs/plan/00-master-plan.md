# FitFloow v2 — Master Plan

> Status: living document. Written before any code. Every implementation agent reads this file first,
> then the module-specific plan it is assigned. Turkish is the product language (all UI strings),
> English is the engineering language (code, docs, tests).

## 1. Vision

FitFloow v2 turns the v1 Next.js monolith (8.5k lines, web-only, "modern but insufficient") into a
three-surface product:

| Surface | Tech | Audience | Goal |
|---|---|---|---|
| **API** (`apps/api`) | Fastify 5 + TypeScript + Mongoose 9 (MongoDB) | mobile + admin | fast (<50 ms p95 for reads), fully tested, single source of truth |
| **Vision** (`apps/vision`) | Python 3.11 FastAPI + HF food classifier (CPU) | API only | photo → food detections; deterministic mock mode for tests |
| **Mobile** (`apps/mobile`) | Expo SDK 57 / React Native 0.87, Expo Router, Reanimated 4 | end users (Eren, İnci, …) | *flawlessly smooth*: skeletons everywhere, 60 fps springs, haptics, optimistic updates |
| **Admin** (`apps/admin`) | Next.js 16 App Router + Tailwind 4 + motion | admins | full control: users, muscles, exercises, program templates, goal constants, mascot copy, foods |

Shared code lives in `packages/core` (pure domain logic + zod schemas + types; zero I/O) and
`packages/api-client` (typed HTTP client used by both frontends).

## 2. Product pillars (what must be excellent)

1. **Training & recovery** (v1 heart, ported + extended): variable-length program cycles, set-by-set
   logging, per-muscle recovery curve (0 → 70 % at half time → 100 %), weekly volume vs targets.
   Muscles and exercise→muscle loads are now **admin-editable data**, not code.
2. **Body measurements & reports**: US Navy body-fat from tape measurements, quick daily weigh-ins,
   EWMA-smoothed weight trend, lean mass, waist. Reports redesigned from scratch.
3. **Goal engine**: user sets only a *target body-fat %*. Engine derives kg of fat to lose, total
   kcal deficit, safe weekly rate (depends on current BF% band — admin-editable table, Alpert cap),
   weeks to goal, daily calorie target, and a week-by-week roadmap. Weekly recalibration from real
   intake + weight trend.
4. **Nutrition & AI food scan**: photo → detected foods with confidence → editable grams → save to
   meal → daily/weekly totals vs target. Local Turkish food DB + Open Food Facts search + barcode.
5. **Weekly report**: week starts on the user's *measurement day* (default Sunday, selectable).
   Report refreshes live as data enters: calories banked in deficit, expected vs actual weight,
   distance to goal, workouts, streaks, muscle volume. Charted over time.
6. **Mascot "Floo"**: a small, expressive character that delivers all motivational copy
   (admin-editable message catalog, context/mood driven).

## 3. Repository layout (monorepo, pnpm workspaces)

```
fit_management/
├── package.json                # workspace root scripts: test, typecheck, lint, build
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docs/
│   ├── plan/                   # THIS plan (00..10)
│   └── research/               # research reports (food recognition, fat-loss science, stack)
├── packages/
│   ├── core/                   # @fitfloow/core — pure domain: schemas (zod), types, math engines
│   └── api-client/             # @fitfloow/api-client — typed fetch client, shared by admin + mobile
├── apps/
│   ├── api/                    # @fitfloow/api — Fastify service
│   ├── vision/                 # Python FastAPI food-recognition microservice
│   ├── admin/                  # @fitfloow/admin — Next.js admin panel
│   └── mobile/                 # @fitfloow/mobile — Expo app
└── scripts/                    # dev orchestration (run api + vision + admin), seed, import
```

The v1 root Next.js app is **removed** (history keeps it). Its domain logic is ported into
`packages/core` with tests; its Mongo collections are migrated in place (see 01-data-model.md §Migration)
so existing users (eren/inci) and their logs survive.

## 4. Toolchain (pinned — verified in this container, see docs/research/stack-2026.md)

| Tool | Version | Notes |
|---|---|---|
| Node / pnpm | 22.x / 10.33 | root `.npmrc` uses `node-linker=hoisted` (Metro + Next friendly). Workspaces: `packages/*`, `apps/api`, `apps/admin`, `apps/mobile` |
| TypeScript | 5.9.3 (core, api, admin) · **6.0.3 (mobile only — Expo 57 expects ~6.0.3)** | never 7.x |
| vitest | 4.1.11 | core, api-client, api, admin |
| jest-expo | 57.0.5 + jest 29.7 + @testing-library/react-native 14 (**all APIs async: `await render()`**) + test-renderer 1.2 | mobile; custom `jest.resolver.js` for reanimated/worklets (already in place) |
| mongodb-memory-server | 11.2.0 → mongod 8.2.6 (auto-download works) | api tests; `test/global-setup.ts` starts one mongod per run |
| Fastify | 5.12.3 · @fastify/jwt 10.2 · cookie 11.1 · cors 11.3 · rate-limit 11.2 · multipart 10.1 · swagger 9.8 / swagger-ui 6.1 · static 10.1 | `fastify-type-provider-zod` 7 (requires zod ≥ 4.1) |
| Mongoose | 9.10.0 | use `returnDocument: "after"` (not `new: true`) |
| zod | 4.6.1 | v4 API (`z.record(key, value)`, `.issues`) |
| Expo | **SDK 57** (expo 57.0.21) → react-native **0.86.3**, react **19.2.3**, expo-router 57.0.20, reanimated **4.5.1** + react-native-worklets **0.10.1**, gesture-handler **2.32.0**, flash-list **2.0.2**, skia **2.6.2**, victory-native 42.0.1, bottom-sheet 5.2.14, mmkv **4.3.2** (Nitro: `createMMKV()`, needs react-native-nitro-modules 0.37.1), expo-image/camera/haptics 57.x | New Architecture always on (no `newArchEnabled` key); `expo export --platform web|android` works headlessly here |
| Next.js | 16.3.4 (Turbopack) · react 19.2.3 · Tailwind **4.3.3** (CSS-first `@theme`, no tailwind.config) · motion 13.2.0 · TanStack Query 5.102 · recharts 3.10 · lucide-react 1.44 | tests: vitest + @testing-library/react 16 + jsdom |
| Python | 3.11 · fastapi · uvicorn · pillow · numpy · **onnxruntime** (no torch at runtime) · pytest · httpx | vision service |

## 5. Engineering rules (non-negotiable)

1. **TDD**: write the failing test first, then the minimal implementation, then refactor. Every
   module ships with tests; a PR/phase is not done until `pnpm test` and `pnpm typecheck` are green.
2. **Pure domain in `packages/core`**: all math (navy, recovery, goal engine, weekly report,
   nutrition totals, week boundaries) is pure, deterministic, injectable `now`. No DB, no fetch.
3. **Contracts first**: DTOs are zod schemas in `packages/core/src/schemas`. API validates input
   with them; api-client and frontends import the inferred types. Never duplicate shapes.
4. **Türkiye time everywhere**: `Europe/Istanbul` (fixed UTC+3). `dateKey = YYYY-MM-DD` in TR local
   day. Week keys are the dateKey of the week's start day (user's measurement day).
5. **Errors**: API returns `{ error: { code, message, details? } }` with proper status. Codes are
   stable strings (`AUTH_INVALID`, `VALIDATION`, `NOT_FOUND`, `FORBIDDEN`, `RATE_LIMITED`, …).
6. **Performance**: composite endpoints for screens (one request per screen on first paint), lean
   projections, indexes for every query pattern, no N+1. Mobile: TanStack Query with persisted cache
   (MMKV) + skeletons + optimistic mutations; lists on FlashList; all animations on the UI thread.
7. **Turkish UI copy**, English code. Numbers formatted `tr-TR`.
8. **No secrets in repo**. `.env.example` per app. Seed passwords only for the two legacy users.
9. **Idempotent seed/migrations** that never destroy existing data.
10. Every agent works only inside its assigned directories; shared files (root package.json,
    pnpm-lock) are touched only via the documented procedure (see §8).

## 6. Phases & team

| Phase | Owner | Output |
|---|---|---|
| 0 Research | 3 research agents | `docs/research/*.md` |
| 1 Plan + scaffold + contracts | orchestrator (Fable 5.1) | this plan, monorepo skeleton, `packages/core` schemas + types, `packages/api-client` surface, module skeletons, test harnesses |
| 2 Backend | 5 × Opus (high) in parallel: **B1** platform/auth/admin, **B2** training, **B3** body+goals+reports (+ core goal engine), **B4** nutrition (+ core nutrition), **B5** vision service + integration | `apps/api` modules, `apps/vision`, tests green |
| 3 Frontend | **F1** Opus admin panel; **F4** Fable 5.1 mobile foundation (design system, motion, skeletons, navigation, mascot, body/goals/reports screens); then **F2** Opus mobile training screens, **F3** Opus mobile nutrition screens; **F4** final polish pass | apps green, tests green |
| 4 Integration | orchestrator | end-to-end smoke (api + vision mock + admin build + expo export web), review, README, push |

Phase 2 and Phase 3 run **concurrently** (frontends develop against `@fitfloow/core` schemas and
`@fitfloow/api-client` with MSW-style fakes until the API is up).

## 7. Definition of done (per module)

- [ ] Tests written first; unit + integration (API: real in-memory Mongo) green
- [ ] `pnpm --filter <pkg> typecheck` green, no `any` leaks in public surface
- [ ] Turkish strings reviewed for tone (mascot voice where applicable)
- [ ] Empty / loading (skeleton) / error states implemented (frontends)
- [ ] Documented in the module README section (how to run, env vars)

## 8. Shared-file procedure for parallel agents

- Adding a dependency: edit **your app's** `package.json`, then run
  `pnpm install --filter <your-package>... --no-frozen-lockfile` from repo root. Keep it rare.
- Never edit another module's directory. Cross-module needs go through `packages/core` types
  (add a new file under `packages/core/src/<your-domain>/`) — never modify another domain's core files.
- API route registration: each module exports `registerXModule(app)` from
  `apps/api/src/modules/<x>/index.ts`; the orchestrator-owned `apps/api/src/app.ts` already imports
  all of them. Do not touch `app.ts` except to fix an import path.
- Mobile: each feature lives in `apps/mobile/src/features/<x>/`; routes in `apps/mobile/app/`
  are thin wrappers created by the foundation agent. Feature agents may add routes under their
  feature's folder only.

## 9. Commands (root)

```
pnpm install
pnpm test            # all workspaces (vitest + jest-expo + pytest via script)
pnpm typecheck       # tsc -b / tsc --noEmit per workspace
pnpm dev:api         # Fastify with watch (needs MONGO_URI or MONGOMS in-memory dev mode)
pnpm dev:admin       # next dev
pnpm dev:mobile      # expo start
pnpm dev:vision      # uvicorn (VISION_MOCK=1 if model not downloaded)
pnpm seed            # idempotent seed + migration
```
