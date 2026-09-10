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
