# Agent brief — common rules (read fully before touching code)

You are one of several agents working **concurrently in the same git working tree** on FitFloow v2.
Orchestrator: Fable 5.1. Repo root: `/home/user/fit_management`. Package manager: pnpm 10 (hoisted).

## Read first (in this order)
1. `docs/plan/00-master-plan.md` — vision, layout, rules, phases
2. Your module brief (`docs/plan/agents/<YOU>.md`) and the plan docs it references
3. `packages/core/src/schemas/*.ts` — the DTO contract (zod). **Do not change existing schema shapes**; you may add new
   schemas in a new file under `packages/core/src/schemas/` only if your brief says so. Prefer using what exists.
4. `packages/api-client/src/index.ts` — the endpoints the frontends call (backend agents must match these exactly).
5. Existing code in your directories (skeletons, models, harness).

## Hard rules
- **TDD**: failing test → minimal code → refactor. Every feature has tests. Run your package's tests often.
- **Ownership**: only edit files inside the directories your brief lists as yours. Never edit another agent's
  directory, `apps/api/src/app.ts`, root configs, or the lockfile by hand. Shared models in `apps/api/src/models/`
  are owned as listed in your brief; extending *your* model files is fine, others' is not (ask via a TODO comment
  in your own code instead, and work around it).
- **Dependencies**: avoid adding packages. If truly needed: add to your app's `package.json` then run
  `pnpm install --no-frozen-lockfile` from the repo root (retry once if it fails due to a concurrent install).
  Never remove or bump dependencies others use.
- **No git commands that change history or the index** (no commit, checkout, stash, reset, rebase). The orchestrator
  commits. Reading (`git diff`, `git log`, `git show v1-legacy:path`) is fine. Legacy v1 code: `pnpm legacy <path>` or
  `pnpm legacy --ls`.
- **Türkiye time**: use `@fitfloow/core` time helpers (`trDateKey`, `weekKeyFor`, `keyBounds`, …). Never `new Date().getDay()`.
- **Pure domain logic in `packages/core`** (no I/O), thin routes in `apps/api` that validate with zod schemas from core and
  call services. Errors: throw `AppError` (see `apps/api/src/lib/errors.ts`).
- Mongoose 9: use `returnDocument: "after"`; always `.lean()` for reads you only serialize; index every query pattern.
- Turkish for user-facing strings, English for code/comments/tests. `tr-TR` number formatting only in frontends.
- Quality gate before you report done: `pnpm --filter <your package> typecheck && pnpm --filter <your package> test`
  are green, and `pnpm --filter @fitfloow/core test` still passes if you touched core.
- Keep a short work log in your brief's "Status" section at the bottom of `docs/plan/agents/<YOU>.md` (append only):
  what you built, what's tested, known gaps. This is what the orchestrator reads first.

## How tests work
- core / api-client / api / admin: `vitest`. API integration tests use the harness in `apps/api/test/harness.ts`:
  `createTestApp()`, `t.reset()`, `seedBasics()`, `asUser(t, {...})`, `asAdmin(t)`, `t.http` (FakeHttpClient for upstream calls),
  `t.clock.now` (injected clock: `ctx.now()` — use it in services instead of `new Date()` so tests are deterministic).
- Run a single file: `pnpm --filter @fitfloow/api exec vitest run test/foo.test.ts`.
- mobile: `jest` via jest-expo; **all React Native Testing Library calls are async** (`await render(...)`, `await renderHook(...)`).

## Performance rules (API)
- One aggregation/query per collection per request; composite screen endpoints must not fan out N+1.
- Never load a user's entire history when a date range suffices.

## Done means
Green typecheck + tests, routes match `02-api-contract.md` and `packages/api-client`, Status section updated.
