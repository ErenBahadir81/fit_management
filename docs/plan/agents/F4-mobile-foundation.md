# F4a — Mobile foundation (Fable 5.1): design system, motion, skeletons, navigation, auth, mascot, home

Model: Fable 5.1 (high effort). Read `COMMON.md` first. Plan docs: `07-mobile-app.md` (authoritative), `09-mascot.md`, `02-api-contract.md`,
research `docs/research/stack-2026.md` (§3 gotchas, §4 configs — jest resolver/setup already in place). Scaffold exists in `apps/mobile`
(Expo SDK 57, expo-router, reanimated 4.5, gesture-handler 2.32, bottom-sheet, flash-list, skia, victory-native, mmkv 4 (Nitro: `createMMKV`),
TanStack Query, zustand). `pnpm --filter @fitfloow/mobile test` (jest-expo, **all RNTL calls async**) and `typecheck` must be green.
Cannot run a device here; `pnpm --filter @fitfloow/mobile export:web` must succeed as the bundle smoke test.

## You own (this stage)
- `apps/mobile/app/**` (routes), `apps/mobile/src/theme/**`, `src/ui/**`, `src/mascot/**`, `src/charts/**`, `src/lib/**`,
  `src/features/auth/**`, `src/features/home/**`, `src/features/profile/**`, `apps/mobile/__tests__/**`, `apps/mobile/README.md`,
  `apps/mobile/src/ui/README.md` (component catalog for F2/F3 — write it; they read it before building).
- Later stages (F4b: body/goals/reports screens; F4c: polish pass over all screens) come as separate briefs.

## The bar
You are the taste owner. "Extremely smooth, flawless, simple" is the acceptance criterion. Concretely:
- Every screen: persisted-cache-first render → skeleton only when there is no cache → 200 ms crossfade to content, zero layout jump
  (skeleton mirrors real layout). Staggered `FadeInDown.springify()` entry for cards (30 ms stagger, cap 6). Pull-to-refresh.
- Every pressable: scale 0.97 spring + light haptic; disabled state; 44 pt min target; `accessibilityRole`.
- Sheets: `@gorhom/bottom-sheet` with dynamic sizing, backdrop dim, keyboard-aware (react-native-keyboard-controller), drag handle.
- Numbers: `fontVariant: ["tabular-nums"]` everywhere; `tr-TR` formatting via `src/lib/format.ts` (`fmtKg`, `fmtPct`, `fmtKcal`, `fmtDate`).
- Theme: light + dark tokens from 07, semantic only, `useTheme()` hook, system-following with manual override in profile (persisted MMKV).
- Motion tokens in `src/theme/motion.ts` (springs snappy/gentle/bouncy, durations, `reduceMotion` aware).
- Charts (`src/charts`): skia/victory-native line with EWMA (solid) + raw (faded dots) + dashed goal line, scrub with haptic ticks; ring; bars.
- Mascot `Floo` (`src/mascot/Floo.tsx`): react-native-svg teardrop-flame body with gradient, eyes that blink (3–5 s), idle breathing,
  moods (happy/cheer/think/sleepy/flex/worried) as spring transitions; `SpeechBubble` with typewriter-free fade; `useMascot(context)` hook
  pulling `/mascot/message` or the home composite's message. Sizes S/M/L.
- Navigation (expo-router): `(auth)/login`, `(tabs)/{index,program,nutrition,body,profile}` with a custom animated tab bar (pill indicator
  sliding with a spring, haptic on switch), modal group for sheets that need full screen (scan camera, workout logger). Deep links `fitfloow://`.
- Auth: `src/lib/auth.ts` token store in expo-secure-store + zustand session; `createApiClient` with `onUnauthorized → logout`; login screen with
  Floo idle, error shake, loading state; auto-login on start with skeleton home.
- Query layer: `src/lib/queryClient.ts` with MMKV persister (`@tanstack/react-query-persist-client` + a small sync storage persister you write),
  `staleTime` 30 s, `gcTime` 7 d, offline-first.
- Home screen (`/reports/home`): per 07 §Screens 2 — mascot header, TodayCard, Calorie ring, Goal progress card, Recovery strip, streaks.
  Provide `HomeSkeleton`. Wire CTAs to routes (program/nutrition/body).
- Profile screen: measurement-day picker (7 chips), activity level, birth date, height, gender, mascot toggle, theme, logout, app version.

## Tests (jest-expo + RNTL, all async)
Theme hook, format helpers, `Pressable` haptic call, `Skeleton` renders, `Floo` mood change updates animated style, tab bar switch, login flow
with a fake client (`src/lib/api.ts` accepts an injected client for tests; also provide `FakeApi` fixtures under `src/lib/fake/` gated by
`EXPO_PUBLIC_API_FAKE=1` so the app is demoable before the backend is up), home renders from fixture and shows skeleton first.

## Handoff
Finish by writing `src/ui/README.md` (every primitive: props, usage, do/don't) and appending your Status. F2/F3 start from that file.

## Status (append below)

### F4a — foundation delivered (2026-09-10)
**Gates**: `pnpm --filter @fitfloow/mobile test` → 24 suites / 124 tests green · `typecheck` clean (tsc 6.0.3) · `export:web` succeeded twice (3.9 MB bundle, `dist-web/` gitignored locally).

**What exists** (all under `apps/mobile`, catalog in `src/ui/README.md` — F2/F3 read that first):
- `src/theme`: semantic light/dark tokens (violet #6D5DF6, status colors, 4-pt spacing, radii 24/14, type 11…40), `motion.ts` (springs snappy/gentle/bouncy, durations, `enterCard` stagger 30 ms cap 6, reduced-motion → 150 ms timing), `ThemeProvider`/`useTheme` (system-following, manual override persisted in MMKV).
- `src/ui`: Text (tabular), Box, Icon, Pressable (0.97 spring + light haptic, 44 pt, disabled state), Button (5 variants, loading), Card (default/primary-gradient/muted, pressable), Surface, Divider, Chip, ProgressBar, Ring (`ringGeometry`), StatTile, ListRow, Skeleton/SkeletonText/SkeletonGroup (1.2 s shimmer), Reveal (200 ms crossfade, never mounts skeleton on cache hit), Stepper (hold-to-repeat), Segmented (spring pill), Toggle, TextField (focus ring, secure eye), Toast (`useToast`), EmptyState, Header, SuccessCheck, TabBar + RouterTabBar (spring indicator, selection haptic), Entry, Screen (safe areas, gutters, pull-to-refresh, keyboard-aware, tab-bar clearance), Sheet/useSheet (gorhom v5 dynamic sizing, backdrop, keyboard interactive), PlaceholderScreen.
- `src/mascot`: `Floo` (react-native-svg flame-drop, gradient, breathing 2.4 s, random blink 3–5 s, tip sway, 6 moods as spring pose transitions, S/M/L), `SpeechBubble` (crossfade + layout spring), `useMascot(context, seed?)` with offline fallbacks.
- `src/charts`: `LineTrend` (victory-native/skia: EWMA solid + raw faded dots + dashed goal + scrub with haptic ticks/tooltip), `RingChart`, `BarWeek`, `Sparkline`, pure `chartMath` (tested).
- `src/lib`: `api.ts` (`getApi/setApi`, `onUnauthorized` bus, secure `tokenStore`), `auth.ts` (SecureStore + memory mirror, web fallback), `queryClient.ts` (30 s stale / 7 d gc / offline-first, MMKV sync persister with throttle, **synchronous hydration before first render**, `AppQueryProvider`, `clearQueryCache`), `storage.ts`, `haptics.ts`, `format.ts` (tr-TR: fmtKg/fmtPct/fmtKcal/fmtDate/fmtDelta/fmtDuration…), `dates.ts`, `env.ts`, `fake/` (**FakeApi** = in-memory implementation of the whole 02-api-contract as a `fetch` under the real client; deterministic fixtures for user/program/logs/recovery/body/goal/nutrition/reports/mascot; `EXPO_PUBLIC_API_FAKE=1`, login eren / eren123).
- `src/features/auth`: zustand `useSession` (cache-first `boot()`, forced sign-out on 401), `LoginScreen` (Floo moods, inline validation, error shake + haptic, loading).
- `src/features/home`: `useHome` (`["home"]`, `useInvalidateHome`), `HomeScreen` (Reveal + HomeSkeleton mirroring heights, staggered entries: mascot header + bubble, weigh-in nudge, TodayCard due/done/skipped/rest, CalorieCard ring + protein bar, GoalCard with on-track chip, RecoveryStrip, StreaksRow; error → retry EmptyState; pull-to-refresh; CTAs → program/nutrition/body).
- `src/features/profile`: `ProfileScreen` (measurement-day chips, activity chips, height stepper, gender segmented, birth-date sheet, mascot toggle, theme segmented, logout, version) with optimistic `useUpdateMe` + rollback toast.
- `app/`: `_layout` (GestureHandler → Keyboard → SafeArea → Theme → Query(persisted) → BottomSheetModal → Toast; `Stack.Protected` auth gate; splash until session boots), `index` redirect, `(auth)/login`, `(tabs)/{index,program,nutrition,body,profile}` with the custom tab bar (program/nutrition/body are placeholders for F2/F3/F4b), `(modals)/{scan,workout}` full-screen modal group (placeholders), `+not-found`. Deep links via scheme `fitfloow://`.
- Tests: `__tests__/{lib,theme,ui,mascot,charts,features}` + `helpers.tsx` (`renderUI`, providers) + `mocks/expo-router.tsx`. `jest.setup.js` mocks gorhom, keyboard-controller, safe-area, skia and victory-native (chart maths tested directly).

**Known gaps / notes for F2, F3, F4b**
- Not run on a device here; verify Skia canvas sizing of `LineTrend` and the gorhom keyboard behaviour on device in the polish pass (F4c). Web export is a bundling smoke test only (Skia needs CanvasKit at runtime on web).
- Typed routes: `.expo/types` is generated by `expo start`; hrefs used are `/(tabs)/…` and `/(modals)/…`.
- Add routes/fixtures to `src/lib/fake/fakeFetch.ts` + `fixtures.ts` when a feature needs endpoints the fake does not model in detail (scan is a canned 3-detection mock; barcode returns null).
- `EmptyState` takes `illustration={<Floo …/>}` (ui must not import mascot to avoid a cycle).
- Body/goals/reports screens (F4b) still to come; `body` tab is a placeholder.
