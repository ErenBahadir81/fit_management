# @fitfloow/mobile — Expo SDK 57 app

## Run

```
pnpm --filter @fitfloow/mobile start                           # expo start (a dev build is required: mmkv, skia and keyboard-controller are native)
EXPO_PUBLIC_API_FAKE=1 pnpm --filter @fitfloow/mobile start    # demo mode: in-memory API, no backend (login eren / eren123)
EXPO_PUBLIC_API_URL=http://<host>:4000/api/v1                  # real API base URL (copy .env.example to .env)
```

- `EXPO_PUBLIC_API_URL` — base URL of the API. Default `http://localhost:4000/api/v1`.
- `EXPO_PUBLIC_API_FAKE=1` — swap the network for the in-memory `FakeApi` (`src/lib/fake`): every route of
  `docs/plan/02-api-contract.md` answered from deterministic fixtures that run the real `@fitfloow/core` engines
  (goal plan, progress, weekly report, recalibration), plus a scripted food scan. The fake sits *under* the real
  `createApiClient`, so auth headers, refresh, 401 handling and error mapping are exercised too. The flag is
  inlined by Metro, so the fake never reaches a production bundle.
- Only `EXPO_PUBLIC_*` variables are inlined; `.env` is git-ignored.

## Quality gates

```
pnpm --filter @fitfloow/mobile typecheck      # tsc 6.0.3
pnpm --filter @fitfloow/mobile lint           # expo lint (eslint-config-expo 57 incl. the React Compiler rules)
pnpm --filter @fitfloow/mobile test           # jest-expo + RNTL 14 — every RNTL call is async (`await render`, `await fireEvent…`)
pnpm --filter @fitfloow/mobile export:web     # bundle smoke test → dist-web/ (~5 MB entry incl. Skia/victory; git-ignored)
```

## Structure

```
app/                     expo-router routes (thin: each file renders one screen from src/features)
  _layout.tsx            GestureHandler → Keyboard → SafeArea → Theme → Query (MMKV-persisted) → BottomSheetModal → Toast; auth gate (Stack.Protected)
  (auth)/login           (tabs)/{index,program,nutrition,body,profile}   (modals)/{workout,scan,goal/setup,goal/roadmap,report/[week]}   +not-found
src/theme                tokens (semantic colours, 4-pt spacing, radii, type scale), motion (springs, stagger), ThemeProvider
src/ui                   the primitive catalog — read src/ui/README.md before writing a screen
src/mascot               Floo (SVG, moods, idle loops), SpeechBubble, useMascot
src/charts               LineTrend (Skia/victory), RingChart, BarWeek, Sparkline, pure chartMath
src/lib                  api (typed client + 401 bus), auth (SecureStore tokens), queryClient (offline-first, MMKV-persisted, hydrated before first paint),
                         storage (MMKV + STORAGE_KEYS), haptics, format (tr-TR), dates (Türkiye time), errors (describeError), useUndoWindow, fake/
src/features/auth        session store (cache-first boot, expired-session reason), LoginScreen
src/features/home        /reports/home composite → HomeScreen (+ cards, skeleton)
src/features/training    program tab (week strip, day card, volume, history), workout logger modal (pure reducer + MMKV draft), recovery panel
src/features/nutrition   day/week log, search/recents/barcode/manual sheets, AI scan modal (pure scan machine + "AI is thinking" theatre)
src/features/body        body tab (trend hero, quick weigh-in, trends chart, history), measurement sheet (Navy preview)
src/features/goals       goal setup (slider + live preview), roadmap (plan vs actual, recalibration)
src/features/reports     weekly report page (score count-up, deficit bars, cards, history)
src/features/profile     profile & settings (optimistic PATCH /me)
```

Conventions every screen follows (details in `src/ui/README.md`): cache-first data with a `Reveal` skeleton only on a cold
cache; staggered `Entry` cards; one primary action per screen; optimistic mutations with rollback + toast (offline gets its
own sentence via `describeError`); FlashList for anything that grows, memoized rows; Turkish copy, `tr-TR` numbers
(`fmtKg`, `fmtPct`, `fmtDate`…), tabular numerals; one haptic vocabulary (`tap` press-in, `select` for choices, `medium` for
confirmations such as a completed set, `success`/`warning`/`error` notifications — a `SuccessCheck` moment fires the success
buzz itself); one swipe-to-delete (`SwipeToDelete`) with one 5 s undo bar (`UndoBar` + `useUndoWindow`); one sheet
(`Sheet`, imperative via `useSheet` or declarative via `open`).

### Query keys and what invalidates them

| Key | Owner | Refreshed by |
|---|---|---|
| `["home"]` | home | every write below |
| `["program"]`, `["recovery"]`, `["workouts", …]`, `["training-stats", n]` | training | complete / skip / undo / delete session, program edit |
| `["nutrition-day", date]`, `["nutrition-week", week]`, `["nutrition-recent"]`, `["nutrition-target"]` | nutrition | add / edit / delete entry, target change, goal changes (target derives from the plan) |
| `["body", …]` | body | weigh-in, measurement add / delete |
| `["goal"]`, `["goal","preview",…]` | goals | goal create / edit / recalibrate / complete / abandon, weigh-ins |
| `["report", …]` | reports | workouts, meals, weigh-ins, goal changes, target changes |
| `["mascot", ctx]` | mascot | goal changes, workouts |

A profile change (`PATCH /me`) invalidates everything — measurement day and activity level feed every composite.

## Testing

- `__tests__/**` mirror `src` for the foundation, body, goals and reports; feature tests for training and nutrition live next
  to their code (`*.test.ts(x)` under `src/features`). `__tests__/smoke.test.tsx` mounts every route from the demo API.
- `__tests__/helpers.tsx`: `renderUI` / `renderHookUI` wrap Theme + Query + Toast providers; `makeQueryClient()` is
  deterministic (no retries, no mutation GC timers). `__tests__/mocks/expo-router.tsx` provides `mockRouter` spies.
- `jest.setup.js` mocks what has no JS implementation under Jest: MMKV, haptics, SecureStore, gorhom sheets (children always
  mounted, `present`/`dismiss` are no-ops), keyboard-controller, safe-area, Skia/victory (chart maths is tested directly),
  **FlashList** (rendered eagerly as a ScrollView — v2 has no layout engine in Jest), expo-camera and expo-image. A test file's
  own `jest.mock` still wins when it needs to drive the camera.
- Screens read the real Türkiye clock, so fixtures must too: use `todayKey()` rather than a pinned date, or pass
  `today: () => key` to `createFakeApi` for pure-maths tests (the fake builds its fixtures for that day).
- Skeletons and sparklines are hidden from accessibility → query with `{ includeHiddenElements: true }`. Reanimated springs
  run under fake timers (`jest.advanceTimersByTime` inside `act`).
