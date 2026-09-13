# FitFloow — MVP → Production sprint contract

Five workers run in parallel. **Stay inside your file ownership.** Anything cross-cutting is a
contract below: implement your side exactly as written, do not renegotiate it mid-flight.

Repo: pnpm monorepo. `apps/{api,mobile,admin,vision}`, `packages/{core,api-client}`.
Mobile is Expo 57 / RN 0.86 / expo-router / reanimated 4 / react-native-svg / TanStack Query /
zustand. All user-facing copy is **Turkish**. Design tokens live in
`apps/mobile/src/theme/tokens.ts` — never hardcode a hex in a feature.

## Non-negotiables

1. **TDD.** Invoke `superpowers:test-driven-development` and follow it. Test first, watch it fail,
   minimal code, watch it pass. Pure logic (reducers, math, catalogs, services) must have tests.
2. **Skills.** Before writing UI, invoke: `superpowers:using-superpowers`, `gpt-tasteskill`,
   `design-taste-frontend`, `frontend-design`, `emil-design-eng`, `design-motion-principles`.
3. **Green at the end.** `pnpm --filter <your package> test` and `pnpm typecheck` must pass.
   Baseline has ONE known red test (`apps/mobile/src/features/training/program/ProgramScreen.test.tsx`
   "Bu hafta") — the orchestrator owns that one, leave it.
4. **No new heavy deps.** `expo-notifications` and `expo-audio` are being installed by the
   orchestrator; everything else already in `package.json` is fair game, nothing new.
5. **Commit nothing.** Leave changes in the working tree. The orchestrator integrates and commits.
6. Report back: what you changed, what you tested, what you deliberately left.

## File ownership (hard boundary)

| Worker | Owns |
|---|---|
| **B** backend | `apps/api/**`, `packages/core/**`, `packages/api-client/**` |
| **F** frontend-core | `apps/mobile/app/**`, `apps/mobile/src/features/{auth,onboarding,goals,home,nutrition,profile,body,reports}/**`, `apps/mobile/src/ui/**`, `apps/mobile/src/theme/**`, `apps/mobile/src/charts/**` |
| **W1** rest/timing | `apps/mobile/src/features/training/workout/{restEngine.ts,restPrefs.ts,RestTimer.tsx}`, `apps/mobile/src/lib/{notifications.ts,sound.ts}` |
| **W2** workout UX | `apps/mobile/src/features/training/lib/logger.ts`, `apps/mobile/src/features/training/workout/{WorkoutScreen,ExercisePane,CardioPane,FinishSheet,AddExerciseSheet,useWorkoutSession}.tsx/.ts`, `apps/mobile/src/features/training/program/**` |
| **Orchestrator** | `apps/mobile/src/mascot/**`, integration, native rebuild, simulator QA |

If you need a change in someone else's file, write it in your report as a one-line request. Do not
edit it.

---

## C1 — Set weight (kg). Owner: **B** defines, **W2** consumes.

Today a strength set is `{ reps, rir }`. There is **no load**. This is the single biggest gap in the
product: you cannot train progressively without it.

**B** changes `packages/core/src/schemas/program.ts`:

```ts
export const zSetEntry = z.object({
  reps: z.number().min(0).max(10000),
  rir: z.number().int().min(0).max(10).nullable(),
  /** Load in kg. `null` = bodyweight / not recorded. Absent in pre-2.1 logs. */
  weightKg: z.number().min(0).max(1000).nullable().default(null),
});
```

and then, in the same PR: `apps/api/src/models/workoutLog.ts` (`SetEntrySchema` gains
`weightKg: { type: Number, default: null }`), tonnage in
`packages/core/src/training/*` (`volumeKg = Σ reps × weightKg`), and anywhere volume/`VolumeCard`
data is produced server-side. **Old logs without `weightKg` must keep working** — treat missing as
`null`, never `0`, and never crash a historical read.

**B** also exposes, for the "last time you did this" reference W2 needs:

```
GET /training/exercises/:name/last   →  { dateKey, sets: SetEntryDTO[] } | { dateKey: null, sets: [] }
```
(most recent logged instance of that exercise name for the caller; 404 never — empty is a valid answer.)
Add it to `packages/api-client` as `training.lastPerformance(name)`.

## C2 — Rest controller. Owner: **W1** provides, **W2** renders.

W1 exports from `apps/mobile/src/features/training/workout/restEngine.ts`:

```ts
export interface RestController {
  running: boolean;
  /** Live seconds left. */
  remaining: number;
  /** Seconds this rest was started with, after any live adjustment. */
  total: number;
  /** Start (or restart) a rest. Omit to use the current preset. */
  start: (seconds?: number) => void;
  skip: () => void;
  /** Live ±N seconds on the running rest. Clamps to >= 0; 0 ends it. */
  adjust: (deltaSeconds: number) => void;
  /** Change the preset used for subsequent rests (persisted per exercise). */
  setPreset: (seconds: number) => void;
  presetSeconds: number;
}

export function useRestController(opts: {
  /** Stable key for per-exercise preset persistence, e.g. the exercise name. */
  exerciseKey: string;
  fallbackSeconds: number;
  onFinish?: () => void;
}): RestController;
```

and from `RestTimer.tsx`:

```tsx
export function RestTimer(props: { controller: RestController; testID?: string }): React.ReactElement | null;
```
(renders `null` when `!controller.running`).

**W2 integration, exactly this shape** — in `WorkoutScreen`:

```tsx
const rest = useRestController({ exerciseKey: currentExercise?.name ?? "", fallbackSeconds: state.restSeconds, onFinish: ... });
// after a set is logged:
rest.start();
// in the bottom bar:
<RestTimer controller={rest} />
```

W2: **delete** the `restEndsAt` / `rest-skip` / `rest-restart` bookkeeping from `logger.ts` — the
reducer no longer owns rest timing, W1's controller does. Keep `restSeconds` in the state as the
per-day default that W1 receives as `fallbackSeconds`. Remove `restRemaining()` from the selectors.

## C3 — Onboarding + energy. Owner: **B** provides, **F** consumes.

There is no sign-up at all today (admins mint users) and every profile fact is buried in the Profil
tab. The product needs to ask for it **once, at account creation**, and turn it into a goal.

**B** adds:

```
POST /auth/register
  body { username, password, displayName, email? }
  → { accessToken, refreshToken, user }   // same shape as /auth/login
  // username lowercased+unique, password >= 8 chars, rate-limited per IP like login
  // new users start with onboardingCompleted: false

POST /onboarding                      (auth required, idempotent)
  body {
    profile:     { gender, birthDate, heightCm, activityLevel, measurementDay },
    measurement: { weightKg, neckCm, waistCm, hipCm? },   // Navy formula inputs
    goal:        { targetBodyFatPct, profile: GoalProfile } | null
  }
  → { user, bodyEntry, goal }
  // writes the profile to the user, creates the first BodyEntry (reuse body.service so bf%/lean
  // mass are computed the normal way), then creates the goal (reuse goals.service).
  // Sets user.onboardingCompleted = true. Safe to call twice.

GET /me/energy                        (auth required)
  → { bmr, tdee, maintenanceCalories, targetCalories, dailyDeficit,
      derivedFrom: "goal" | "maintenance" | "default",
      activityLevel, activityMultiplier, leanMassKg | null }
```

`UserDTO` gains `onboardingCompleted: boolean` and `email: string | null`.
All three land in `packages/api-client` as `auth.register(...)`, `onboarding.complete(...)`,
`me.energy()`. Mirror them in `apps/mobile/src/lib/fake/*` so the demo/fake API still works — **F is
blocked on the fake implementations**, so do the fakes early and mention it in your first report.

## C4 — Goal projection in plain Turkish. Owner: **B** provides, **F** renders.

`GoalPlan` today reports `estimatedWeeks`, `targetDate`, `initialDailyCalorieTarget`. The user's
complaint is that it never says *when you get where* in words a person understands. Add to the plan
(pure, in `packages/core/src/goal/plan.ts`, fully unit-tested):

```ts
export interface GoalMilestone {
  /** 0.25 / 0.5 / 0.75 / 1 of the total fat to lose. */
  fraction: number;
  dateKey: string;
  weightKg: number;
  bodyFatPct: number;
  /** e.g. "4 hafta sonra" */
  etaLabelTr: string;
}
export interface GoalPlan {
  // ...existing
  milestones: GoalMilestone[];
  /** One sentence: "17 Ocak'ta ~78 kg ve %12 yağ oranındasın — 14 hafta, günde 1.850 kcal." */
  summaryTr: string;
}
```

---

## Definition of done for everyone

- Tests written first, all green.
- `pnpm typecheck` clean for your packages.
- No `console.log` left behind, no `any` added, no TODO comments shipped as the answer.
- Turkish copy is warm and plain. No shaming, no exclamation-mark spam, no "!!!".
- Every touch target >= 44pt. Every animated thing respects `useReducedMotion()`.
