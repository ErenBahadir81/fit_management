# F1 — Admin panel (Next.js 16 + Tailwind 4 + motion)

Model: Opus (high effort). Read `COMMON.md` first. Plan docs: `08-admin-panel.md` (authoritative), `02-api-contract.md`, `03-goal-engine.md`
(for the rate-table simulator), `09-mascot.md`. Types: `@fitfloow/core`; client: `@fitfloow/api-client` (`authMode: "cookie"`, baseUrl `/api/v1`
— Next rewrites proxy to the API so cookies are same-origin).

## You own
- `apps/admin/**` (scaffold exists: Next 16 app router, Tailwind 4 CSS-first, vitest + RTL configured)

## Design bar (this is judged hard)
- Distinctive, calm, professional. Not a generic template: strong typographic hierarchy (Inter via `next/font`), 8-pt grid, restrained palette
  (brand violet `#6D5DF6` for primary actions only; neutrals for everything else; semantic green/amber/red), light + dark via
  `prefers-color-scheme` **and** a manual toggle persisted in `localStorage`.
- Layout: collapsible sidebar (icons + labels, active state, keyboard accessible), top bar (breadcrumb, global search ⌘K command palette, admin
  avatar menu), content max-width 1280, generous whitespace, cards with 1 px borders (no heavy shadows).
- Motion (`motion` 13): page enter fade+8 px slide 160 ms, list reorder via `Reorder` (muscles, program days/exercises), dialogs/drawers with
  spring (stiffness 300, damping 30), skeleton shimmer rows on every table while loading, toasts slide from bottom-right. Respect
  `prefers-reduced-motion`.
- Data: TanStack Query (query keys per resource), optimistic updates on toggles/reorders/inline edits, error toasts with retry, empty states with
  a one-line explanation and a primary action.
- Forms: zod schemas from core for validation; inline field errors in Turkish; disabled submit while pending; unsaved-changes guard on builders.
- Accessibility: focus rings, labels, `aria-*` on dialogs; tables with sticky header; keyboard shortcuts documented in the ⌘K palette.

## Pages (all listed in 08 — build every one)
Login · Dashboard · Users (+ detail overview) · Muscles · Exercises · Program templates (+ builder with live weekly volume matrix using
`templateVolume` from `@fitfloow/core/training` if exported, else compute locally: Σ targetSets × load per muscle) · Goal settings (constants +
rate table editor with `validateRateTable` + live simulator using `computeGoalPlan` from `@fitfloow/core/goal` **if exported by then**; otherwise
implement the simulator against `POST /goals/preview`-like local math per 03 and switch when core exports it) · Mascot messages (with an SVG Floo
preview per 09 palette) · Foods (+ import dialog) · Scans · Settings.

## Engineering
- `src/lib/api.ts` creates the client once (`createApiClient({ baseUrl: "/api/v1", authMode: "cookie" })`).
- Auth gate: `src/middleware.ts`-free approach: a server component in `(panel)/layout.tsx` calls `GET /api/v1/auth/me` with forwarded cookies
  (`headers()`), redirects to `/login` on 401, passes the user down. Client `QueryClientProvider` in `src/app/providers.tsx`.
- Tests (vitest + RTL): rate-table editor validation, program builder volume matrix, login form (mock fetch), muscles reorder optimistic update,
  command palette navigation. `pnpm --filter @fitfloow/admin build` must succeed (Turbopack) and `typecheck` + `lint` clean.
- Until the backend routes land you may run against fixtures: put MSW-free fakes behind `NEXT_PUBLIC_API_FAKE=1` in `src/lib/api.ts` (a tiny in-memory
  fake implementing the same client surface) so the UI is demoable and testable now; the fake must be tree-shaken out when unset.

## Status (append below)

### 2026-09-10 — F1 complete

**Design direction.** "Calm technical instrument": neutrals carry the UI, brand violet `#6D5DF6` is reserved for
primary actions, active nav and focus rings. Inter via `next/font` (weights 400–700, `latin-ext`), display sizes with
tight tracking, `tnum` on every table/number. 8-pt spacing, 1-px hairlines, shadows only on floating layers.
Tokens live in `src/app/globals.css` as `--ff-*` custom properties, exposed to Tailwind 4 through `@theme inline`, with
light/dark defined together (`:root`, `@media prefers-color-scheme` and `html.dark` for the manual toggle persisted in
`localStorage`). `src/lib/theme-tokens.test.ts` fails the build if a token exists in one theme but not the other.

**Pages (all 11 from 08-admin-panel.md).**
`/login` (split brand/form, server-provided `?next` + `?forbidden`) · `/` dashboard (6 KPI tiles with sparklines, 14-day
activity area chart, system health, Floo bubble) · `/users` (sortable table, drawer create/edit with zod, reset password,
assign program, delete confirm) · `/users/[id]` (body/goal/program/week-report overview + roadmap chart + last workouts) ·
`/muscles` (motion `Reorder` drag **plus** keyboard arrows, inline edit of every field, colour picker, expandable
recovery curve) · `/exercises` (search + muscle filter, editor dialog with 0–1 load sliders per muscle) · `/programs`
(template cards with volume mix bar) · `/programs/[id]` **builder** (day columns, drag-reorder inside a day, move
exercises between days, exercise picker, cardio targets, live muscle × day volume matrix, unsaved-changes guard) ·
`/goals-settings` (constants form driven by a declarative spec + rate-table editor + live simulator) · `/mascot`
(catalog by key group, variant editor, Floo preview with placeholders filled) · `/foods` (inline per-100 g editing,
Atwater cross-check warning, import dialog) · `/scans` (quality-monitoring gallery, confidence bars, match rate) ·
`/settings` (week/vision defaults, admin password, service health).

**Engineering.**
- `src/lib/api.ts` builds the real cookie-auth client (`baseUrl: /api/v1`, `authMode: "cookie"`). The in-memory fake
  (`src/lib/fake/`) sits behind `NEXT_PUBLIC_API_FAKE=1`; `next.config.ts` always inlines a literal so the branch folds,
  and the fake is reached only through a dynamic `import()` — with the flag unset it lands in its own chunk that no
  route manifest references, so it is never downloaded. Verified: `NEXT_PUBLIC_API_FAKE=1 pnpm build && pnpm start`
  serves all 13 routes with 200 and real seeded content.
- Auth gate: `(panel)/layout.tsx` is a server component calling `GET /api/v1/auth/me` with forwarded cookies
  (`src/lib/auth-server.ts`), redirecting to `/login` on 401 and `/login?forbidden=1` for non-admins.
- TanStack Query with per-resource keys in `src/lib/queries.ts`; muscle reorder and inline edits are optimistic with
  rollback + error toast; 4xx is never retried.
- **Now delegating to core** (it landed while this was in flight): `computeGoalPlan` + `safeWeeklyRate` (goal),
  `templateWeeklyVolume` (training), `recoveredFraction` (recovery), `validateRateTable`/`DEFAULT_*` (settings),
  `renderTemplate` (mascot). `src/lib/goal-sim.ts` and `src/lib/volume.ts` are now thin adapters that keep the panel's
  input shape, the per-day matrix split and the Turkish labels.
- No `setState` inside effects anywhere (React 19 lint): theme, reduced-motion, client-mount and the sidebar flag are
  `useSyncExternalStore` stores (`src/lib/theme.tsx`, `src/lib/persist.ts`); drafts reset via `key` remounts.
- Motion: page enter fade+8 px/160 ms, spring (300/30) for dialogs, drawers and reorder, toasts spring in from
  bottom-right, shimmer skeletons. `MotionConfig reducedMotion="user"` plus a CSS `prefers-reduced-motion` override.

**Tests — `pnpm --filter @fitfloow/admin test`: 12 files, 99 passing.**
goal engine contract (20) · volume matrix (11) · tr-TR formatters (8) · theme-token parity + reduced motion (7) ·
login form with mocked client (4) · command palette navigation/filtering (10) · muscles reorder optimistic + rollback
(6) · program builder live volume matrix (7) · rate-table validation + save gating (10) · users CRUD flows (7) ·
exercises + mascot (8) · smoke (1). Two real bugs were caught by tests: an inline-edit ref that re-selected on every
keystroke, and the same issue in the palette input.

**Quality gate:** `typecheck`, `lint`, `test` and `build` (Turbopack, 13 routes) all green; build run twice
(mid-way and final) plus a demo-mode build served and smoke-checked.

**Known gaps / handover notes.**
- Cross-day drag-and-drop of exercises is done with explicit ◀ ▶ buttons (keyboard-accessible); `motion`'s `Reorder`
  has no cross-list support, so within-day drag + explicit move was chosen over a bespoke DnD layer.
- The unsaved-changes guard on the builder covers `beforeunload`, the "back to list" action and an always-visible
  banner; App Router has no navigation-intercept API, so a sidebar click can still leave with unsaved edits.
- `/scans` renders `imageUrl` with a plain `<img>` (B5 has not defined the image host yet) — switch to `next/image`
  once the domain is known.
- The fake serves only the admin + auth surface with real data; the user-facing namespaces resolve to empty/neutral
  payloads. Delete `src/lib/fake/` once the API is live if the demo mode is no longer wanted.
