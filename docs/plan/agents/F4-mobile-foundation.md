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
