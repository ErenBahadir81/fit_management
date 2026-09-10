# 10 — Testing & Quality

## TDD loop (every task)
1. Write the test that describes the behaviour (name it after the behaviour, not the function).
2. Run it → red. 3. Minimal implementation → green. 4. Refactor with tests green. 5. Commit.

## Layers
| Package | Runner | What |
|---|---|---|
| packages/core | vitest | pure functions: navy, recovery, goal engine, weekly report, week keys, nutrition math, schemas (parse/reject) |
| packages/api-client | vitest | request building, auth refresh flow (mock fetch), error mapping |
| apps/api | vitest + mongodb-memory-server | per-module integration: `app.inject()` against real in-memory Mongo; auth; validation; composite endpoints; migrations idempotent |
| apps/vision | pytest | mock predictor, label mapping, image validation, API contract; model tests skipped unless `RUN_MODEL_TESTS=1` |
| apps/admin | vitest + RTL + `next build` | forms, tables, builder volume matrix |
| apps/mobile | jest-expo + RNTL | hooks, formatters, components (skeleton/content/press), navigation smoke; `expo export --platform web` smoke |

## API test harness (B1 provides, others use)
`apps/api/test/harness.ts`: `createTestApp()` → builds Fastify app bound to an in-memory Mongo (one server per test file, DB dropped
between tests), `asUser(app, {role})` → returns auth headers, `seedBasics()` → muscles/exercises/settings/mascot. Remote HTTP
(Open Food Facts, vision) is behind an injectable `HttpClient` interface with a fake in tests.

## Quality gates (root `pnpm check`)
`pnpm typecheck && pnpm lint && pnpm test` — must be green before the orchestrator merges a phase. Coverage targets: core ≥ 90 %,
api ≥ 80 % lines. No skipped tests without a linked TODO in the plan.
