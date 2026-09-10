# 07 — Mobile App (`apps/mobile`, Expo SDK 57)

Owner: **F4 (Fable 5.1)** builds the foundation and owns "flawless". **F2** (training) and **F3** (nutrition) build features on it.

## Stack
expo 57 · expo-router 57 (typed routes) · react-native-reanimated 4 + react-native-worklets · react-native-gesture-handler 3 ·
@gorhom/bottom-sheet 5 · @shopify/flash-list 2 · expo-image · expo-camera · expo-haptics · expo-secure-store · react-native-mmkv 4 ·
@tanstack/react-query 5 (+ persist to MMKV) · zustand 5 · react-native-svg 15 · victory-native 42 + @shopify/react-native-skia (charts) ·
expo-linear-gradient · @fitfloow/core · @fitfloow/api-client. Tests: jest-expo 57 + @testing-library/react-native 14.

## Structure
```
apps/mobile/
  app/                       # expo-router routes (thin): (auth)/login, (tabs)/{index,program,nutrition,body,profile}, modals
  src/
    theme/                   # tokens.ts (colors light/dark, spacing 4-pt, radii, type scale, shadows), motion.ts (springs, durations), ThemeProvider
    ui/                      # primitives: Text, Box, Pressable (scale+haptic), Button, Card, Surface, Chip, Ring, ProgressBar, Stepper, Segmented,
                             #   Sheet (gorhom), Skeleton (shimmer via reanimated), SkeletonGroup, EmptyState, Toast, Confetti-free Success, Header, TabBar
    mascot/                  # Floo.tsx (svg + reanimated), SpeechBubble.tsx, useMascot.ts
    charts/                  # LineTrend (skia), Sparkline, RingChart, BarWeek — consistent axis/tooltip style
    lib/                     # api.ts (client + auth token store), queryClient.ts (persist), storage.ts (mmkv), format.ts (tr-TR), haptics.ts, dates.ts
    features/
      auth/                  # login screen, session store, refresh handling
      home/                  # HomeScreen: mascot header, today workout card, calorie ring, goal progress, recovery summary
      training/  (F2)        # ProgramScreen (week strip, day list), WorkoutScreen (set-by-set logger), RecoveryScreen, EditDay/AddExercise sheets, History
      nutrition/ (F3)        # DayScreen (meals), SearchSheet, ScanScreen (camera + AI overlay), ScanResultSheet, WeekNutrition, TargetSheet
      body/      (F4)        # BodyScreen (summary, trends), MeasureSheet (Navy live preview), WeighInSheet, History
      goals/     (F4)        # GoalSetup (target slider + profile + live preview), Roadmap (week list + chart), GoalProgress card
      reports/   (F4)        # WeeklyReportScreen (hero score, deficit, body, training, mascot), ReportHistory
      profile/   (F4)        # settings (measurement day picker, activity level, birth date), logout
  __tests__/                 # component + hook tests
```

## Design system ("premium calm")
- **Color**: light + dark themes (follow system). Ink `#0F141C`, bg `#F5F6FA` / dark bg `#0B0D12`, surface white / `#151923`,
  primary violet `#6D5DF6`, accent gradient `#6D5DF6→#8B7CFF`, success `#16A34A`, warning `#F59E0B`, danger `#EF4444`,
  muscle status colors from the API. Semantic tokens only; never raw hex in features.
- **Type**: system font (SF/Roboto) with `fontVariant: ['tabular-nums']` for every number; scale 11/13/15/17/22/28/40; big hero numerals.
- **Spacing**: 4-pt grid; screen gutter 20; card radius 24; control radius 14; min touch target 44.
- **Motion** (`theme/motion.ts`): `spring.snappy {damping 18, stiffness 260}`, `spring.gentle {damping 20, stiffness 140}`,
  `spring.bouncy {damping 12, stiffness 220}`; durations 120/200/320 ms; easing `Easing.out(Easing.cubic)`. Every pressable scales to 0.97
  with a light haptic. Screen content enters with a staggered fade+translateY (12 px) via `entering={FadeInDown.springify()}`.
  Sheets use gorhom with backdrop blur/dim and a drag handle. Never animate layout on the JS thread; use `useAnimatedStyle`/`Layout`.
- **Skeletons**: each screen has a `<XScreenSkeleton/>` mirroring the real layout (same heights) with a diagonal shimmer (reanimated,
  1.2 s loop). Skeleton shows only if data not in persisted cache; otherwise render cached data instantly and revalidate silently.
  Transition skeleton → content with a 200 ms crossfade, no layout jump.
- **Feedback**: optimistic mutations (TanStack `onMutate`), success = haptic `notificationAsync(Success)` + brief check animation;
  errors → inline toast (never alert dialogs). Pull-to-refresh on every list screen.
- **Charts**: skia-based, 60 fps scrubbing with a haptic tick when the selection changes; goal line dashed; EWMA line solid, raw points faded.
- **Accessibility**: `accessibilityLabel` on controls, dynamic type respected up to 130 %, reduced-motion → springs become 150 ms fades.

## Screens (spec)
1. **Login**: username/password, mascot idle, error shake; stores tokens in SecureStore; auto-refresh via interceptor.
2. **Home** (`/reports/home`): header "Merhaba, {name}" + date + Floo bubble; TodayCard (workout: start / done / rest with CTA);
   Calorie ring (eaten/target/remaining) with protein bar; Goal progress card (percent, kg to go, on-track chip, projected date);
   Recovery strip (overall ring + top 3 muscles); streaks. Single query, skeleton, staggered entry.
3. **Program** (F2): week strip (7 days aligned to weekdays, today highlighted), current day card with exercises & targets, buttons
   Start / Skip / Jump; day editor sheet (reorder, add from catalog with search, set targets); history list (FlashList) with per-log detail.
4. **Workout logger** (F2): one exercise at a time, set rows with reps/seconds + RIR steppers, "Tamamla seti" with haptic, rest timer chip,
   progress header (sets done/total), swipe between exercises, ad-hoc exercise add, skip exercise, cardio segment logger, finish → summary
   sheet with muscle load chips + mascot line → back to home with optimistic program pointer update.
5. **Recovery** (F2): muscle grid (readiness rings, status colors), detail sheet (hours to full, weekly sets vs target bar, last trained).
6. **Nutrition day** (F3): date pager (swipe days), ring + macro bars, meal sections (FlashList) with entries (swipe to delete, tap to edit grams),
   FAB "+" → action sheet: Tara (camera) / Ara / Son kullanılanlar / Barkod / Elle gir. Week view tab with 7 bars vs target.
7. **Scan** (F3): full-screen camera with framing guide, shutter with haptic, gallery pick; AI overlay theatre (05 §UX); results sheet.
8. **Body** (F4): hero (weight EWMA, bf %, lean, deltas), quick weigh-in inline stepper (one tap to log today), trends chart with range
   segmented (30/90/180/365), measurement history; "Ölçüm ekle" sheet with Navy live preview & validation (waist > neck).
9. **Goal setup / roadmap** (F4): current bf pill → target slider (0.5 steps, clamped to safe min) → profile segmented (Temkinli / Optimal /
   Agresif) → live preview (fat kg, weeks, daily kcal, target date) → "Hedefi başlat" (mascot cheer). Roadmap: chart expected weight vs
   actual EWMA, week list (planned kcal, deficit, weight), recalibrate button with explanation.
10. **Weekly report** (F4): hero score ring + mascot message; "Bu hafta {x} kcal ekside kaldın ≈ {kg} kg yağ"; deficit bars per day;
    body card (EWMA delta vs expected, bf, waist); training card (sessions, volume vs targets); goal distance; history carousel of past weeks.
11. **Profile** (F4): measurement day picker (Pazar…Cumartesi), activity level, birth date, height, gender, mascot toggle, theme, logout.

## Performance checklist (F4 enforces)
- No `ScrollView` for long lists; FlashList with `estimatedItemSize`.
- Memoized rows; stable keys; `useCallback` handlers; images via expo-image with `cachePolicy="memory-disk"`.
- Query keys per screen; `staleTime` 30 s; persisted cache hydrates before first paint.
- Reanimated only for gestures/animations; no `Animated` (RN) API.
- Startup: fonts none (system), splash → home < 1 s on cached data.
- Tests: hooks (queries with mocked client), pure formatters, components (render + press + skeleton state) with RNTL.
