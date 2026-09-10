# 08 — Admin Panel (`apps/admin`, Next.js 16) — owner F1

Stack: Next.js 16 App Router (React 19), Tailwind 4, `motion` 13, TanStack Query 5, recharts 3, lucide-react, zod (from core),
`@fitfloow/api-client`. Auth: login form → `POST /auth/login?cookie=1` (API sets httpOnly cookies on the API origin; admin calls the API
with `credentials: "include"`). Middleware guards `/(panel)` by checking a lightweight `/auth/me` on the server (cookie forwarded).
Dev proxy: `next.config` rewrites `/api/v1/*` → `API_URL` so cookies are same-origin.

## Design
Dense but calm dashboard: left sidebar (collapsible, icons + labels), top bar with search + admin identity, content max-width 1280.
Light and dark. Typography Inter (next/font). Tables with sticky headers, inline editing where sensible, optimistic updates, toasts,
command palette (⌘K) for navigation. `motion` for page transitions (fade/slide 160 ms), list reordering (layout animations), sheet/dialog
spring. Skeleton rows on every table.

## Pages
1. `/login`
2. `/` Dashboard: KPI tiles (users, active 7d, workouts 7d, meals 7d, scans 7d, active goals), 14-day activity area chart, system health
   (DB, vision mock/real, latency), Floo static in the corner.
3. `/users`: table (username, name, role, gender, last seen, program, goal status), create/edit drawer, reset password, assign program
   template, delete with confirm. `/users/[id]`: overview (latest body, goal + roadmap chart, last workouts, current week report).
4. `/muscles`: sortable list (drag to reorder with motion `Reorder`), inline edit name/size/hours/targets/color/active; recovery curve
   preview chart per muscle.
5. `/exercises`: searchable table; editor dialog with muscle-load sliders (0–1 per muscle, chips), metric, kind, equipment, instructions.
6. `/programs`: templates list; `/programs/[id]` **builder**: days as columns (drag-and-drop exercises between days, reorder days),
   exercise picker with search, per-exercise set/rep/RIR fields, cardio targets, live **weekly volume matrix** (muscle × sets vs target,
   colored under/in/over) computed with core `weeklyVolume`; duplicate; assign to users.
7. `/goals-settings`: constants form (kcal/kg fat, Alpert, floors, protein, activity multipliers, EWMA alpha, recalibration) + **rate table
   editor** (grid per sex, add/remove bands, validation: contiguous, non-overlapping 0..100) + a live simulator ("103 kg, 10 % → 7 %") that
   calls `/goals/preview`-equivalent core function client-side to show weeks & daily kcal as you edit.
8. `/mascot`: message catalog by key, variants editor, mood select, preview bubble with Floo, reset to defaults.
9. `/foods`: table with search, per-100g editing, servings, aliases (vision labels), verified flag; import dialog (OFF/USDA query → pick → import).
10. `/scans`: recent scans gallery with detections and which food was finally logged (quality monitoring).
11. `/settings`: week defaults, vision toggles, admin account password.

## Tests
vitest + @testing-library/react for: rate-table validation, program builder volume matrix, forms (zod), api-client hooks with mocked fetch.
`next build` must pass (typecheck + lint).
