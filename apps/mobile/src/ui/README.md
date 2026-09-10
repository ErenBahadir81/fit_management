# FitFloow mobile — UI catalog (`src/ui`, `src/theme`, `src/mascot`, `src/charts`)

This is the contract F2 (training) and F3 (nutrition) build on. Everything here is tested
(`__tests__/ui/*`), themed (light + dark), animated on the UI thread and accessible. **Compose these;
do not create new primitives or use raw hex / raw `Pressable` / RN `Animated` in features.**

```ts
import { Screen, Header, Card, Button, Text, ... } from "@/ui";      // or "../../ui"
import { useTheme, spacing, radii, springs, enterCard } from "@/theme";
import { Floo, SpeechBubble, useMascot } from "@/mascot";
import { LineTrend, RingChart, BarWeek, Sparkline } from "@/charts";
```
(`@/*` → `src/*`, see tsconfig.)

## The rules every screen follows
1. **Cache-first, skeleton second.** `useQuery` data is persisted in MMKV and hydrated *before* the first
   render. Wrap the body in `<Reveal ready={!!data} skeleton={<XSkeleton/>}>` — the skeleton is mounted
   only when there is no cache; the swap is a 200 ms crossfade with zero layout jump (skeleton mirrors
   the real heights — keep them in a `HEIGHTS` constant, see `features/home/HomeSkeleton.tsx`).
2. **Staggered entry.** Wrap each card in `<Entry index={i}>` (30 ms stagger, capped at 6, reduced-motion aware).
3. **One primary action per screen** (`<Button variant="primary">`). Everything else is `secondary` / `ghost`.
4. **Every number is `tabular`.** `<Text tabular>` + format via `src/lib/format.ts` (`fmtKg`, `fmtPct`, `fmtKcal`, `fmtDate`, `fmtDelta`, `fmtDuration`).
5. **Feedback is immediate.** `Pressable` already scales 0.97 + light haptic; mutations are optimistic (`onMutate` → rollback in `onError` + `useToast().show({ message: describeError(e, "…"), kind: "error" })` so offline gets its own sentence). Haptic vocabulary: `tap` press-in · `select` for choices (chips, tabs, pickers) · `medium` for confirmations (a completed set, a swipe-delete) · `success`/`warning`/`error` notifications. A big moment shows `<SuccessCheck/>`, which fires the success buzz itself — don't add a second one in the mutation. Never `Alert`.
6. **Pull-to-refresh** on every data screen (`<Screen onRefresh>`; FlashList screens pass `refreshControl={<ListRefreshControl …/>}`), FlashList for long lists (`<Screen scroll={false}>` + `FlashList`, `memo` rows, `useCallback` renderItem, no inline style objects), expo-image with `cachePolicy="memory-disk"`.
8. **Destructive = swipe + undo.** Rows wrap in `SwipeToDelete` (short swipe reveals a tappable "Sil", long swipe commits); the screen keeps a 5 s `UndoBar` through `useUndoWindow` (`src/lib`). Every row also exposes a `delete` accessibility action.
7. **Turkish copy, short and warm.** Sentence case, no exclamation spam, Floo's voice comes from the API.

## Theme (`src/theme`)
| Export | What |
|---|---|
| `useTheme()` | `{ colors, scheme, isDark, mode, setMode, spacing, radii, type, shadows }`. Throws outside `ThemeProvider` (root layout provides it). |
| `useThemedStyles(t => ({...}))` | memoised style factory on the current scheme. |
| `colors.*` | semantic only: `bg surface surfaceElevated surfaceMuted ink inkMuted inkSubtle inkInverse primary primaryStrong primarySoft onPrimary onPrimaryMuted onPrimaryBorder gradient success/successSoft warning/warningSoft danger/dangerSoft border borderStrong overlay skeleton skeletonHighlight ringTrack chartGrid tabBar`. On a `Card variant="primary"` use `<Text color="onPrimary">` / `"onPrimaryMuted"` — never a raw white. |
| `spacing` | 4-pt grid `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · xxxl 32 · huge 48`, `gutter 20`, `cardPad 20`, `touch 44` |
| `radii` | `xs 6 · sm 10 · control 14 · md 18 · card 24 · sheet 28 · pill 999` |
| `type` | `caption 11 · label 13 · body 15 · bodyStrong 15 · title 17 · heading 22 · display 28 · hero 40` |
| `statusTone` | maps API statuses (`ready/recovering/fatigued`, `ahead/onTrack/behind/stalled`) to a `Tone` |
| motion | `springs.snappy {18/260} · gentle {20/140} · bouncy {12/220}`, `durations {120/200/320}`, `timing.fast/base/slow/reduced`, `easeOut`, `enterCard(i, reduce)`, `staggerDelay(i)`, `resolveSpring(kind, reduce)`, `PRESS_SCALE 0.97` |

Reduced motion: use `useReducedMotion()` from reanimated and `resolveSpring`/`timing.reduced` — every primitive already does.

## Primitives (`src/ui`)

### Layout
- **`Screen`** `{ scroll=true, keyboard, refreshing, onRefresh, tabBar=true, edges=["top"], contentStyle }` — safe areas, 20 pt gutters, `gap: 16` between children, pull-to-refresh, bottom clearance for the floating tab bar. `keyboard` swaps in `KeyboardAwareScrollView`. Do: one `Screen` per route. Don't: nest `ScrollView`s; for FlashList use `scroll={false}` and pad with `useTabBarSpace()`.
- **`Header`** `{ title, subtitle?, eyebrow?, left?, right?: {icon,label,onPress}, compact?, trailing? }` — large 28 pt title (role=header); `compact` for sheets/modals.
- **`Box`** spacing shorthands (`p px py pt pb pl pr m mx my mt mb gap`), `row wrap center align justify flex bg radius border`.
- **`Surface`** `{ elevated?, muted?, radius, bordered? }` themed plane, no padding.
- **`Card`** `{ variant: "default"|"primary"|"muted", onPress?, padded=true }` — 24 pt radius, 20 pt padding, soft shadow; `primary` = violet gradient (use white text); `onPress` makes the whole card a 0.98 pressable.
- **`Divider`** `{ inset? }`.
- **`Entry`** `{ index }` — staggered entering animation wrapper (Animated.View).
- **`Reveal`** `{ ready, skeleton }` — skeleton ⇄ content crossfade (see rule 1).

### Text & icons
- **`Text`** `{ variant, color (token), tone ("primary|success|warning|danger|neutral"), tabular, align, weight }` — dynamic type capped at 130 %.
- **`Icon`** `{ name: IconName (Ionicons), size=20, color: token|raw }`.

### Pressables
- **`Pressable`** `{ haptic: "tap"|"select"|"medium"|"none", scaleTo=0.97, minTarget=true, disabled }` — role=button, 44 pt min height, `accessibilityState.disabled`. Base of every interactive element. Don't use RN `Pressable`/`TouchableOpacity` directly.
- **`Button`** `{ label, variant: "primary"|"secondary"|"ghost"|"danger"|"inverse", size: "sm"|"md"|"lg", icon?, iconRight?, loading, full }` — `loading` shows a spinner, blocks presses, sets `busy`. `inverse` is white-on-violet for use inside `Card variant="primary"`.
- **`Chip`** `{ label, selected, tone, icon?, dot?: color, size, onPress? }` — pill; selected = solid primary; `onPress` gives a selection haptic; `dot` for muscle colors.
- **`ListRow`** `{ label, value?, hint?, icon?, right?: node, onPress?, chevron, destructive }` — settings rows; put `Toggle`/`Segmented`/`Stepper` in `right`.

### Controls
- **`TextField`** `{ label, error, hint, icon, secure, unit, ...TextInputProps }` — animated focus ring, error line (live region), eye toggle. Forward-ref to `TextInput`.
- **`Stepper`** `{ value, onChange, step, min, max, format, size }` — −/+ with clamp, press-and-hold repeat, tabular value. Test ids: `${testID}-dec/-inc`.
- **`Segmented<T>`** `{ options: {value,label}[], value, onChange, size }` — spring pill indicator, role=tablist/tab, test ids `${testID}-${value}`.
- **`Toggle`** `{ value, onChange }` — role=switch, `checked` state, animated track colour.

### Progress
- **`ProgressBar`** `{ value 0..1, tone, height=8, label?, valueLabel? }` — spring-animated width, role=progressbar with `accessibilityValue`.
- **`Ring`** `{ value 0..1, size=120, stroke?, tone, color?, gradient=true, trackColor?, children }` — SVG ring, animated dash offset; children centred. `ringGeometry()` is exported for maths.
- **`StatTile`** `{ label, value, hint?, icon?, tone? }` — compact number tile (streaks, deltas).

### Feedback
- **`useToast().show({ message, kind: "success"|"error"|"info", duration })`** — top toast, haptic per kind, auto-hides, tap to dismiss, role=alert. Provided at the root.
- **`EmptyState`** `{ title, body?, icon?, illustration?, action?: {label,onPress,icon}, compact }` — pass `illustration={<Floo mood="sleepy" size="m" />}` for empty data, `mood="worried"` for errors.
- **`SuccessCheck`** `{ size=72, withHaptic=true }` — circle pops (bouncy) + check draws (320 ms). Use in completion sheets.
- **`Skeleton`** `{ width, height, radius=8, circle }`, **`SkeletonText`** `{ lines, lineHeight, lastWidth }`, **`SkeletonGroup`** — 1.2 s diagonal shimmer, hidden from screen readers (query with `includeHiddenElements: true` in tests).

### Sheets & navigation
- **`Sheet`** (gorhom v5) `{ title?, padded=true, open?, ...BottomSheetModalProps }` + `useSheet()` → `{ ref, present, dismiss }`; **`SheetActions`** button row. Dynamic sizing, dimmed backdrop, drag handle, keyboard-aware (`interactive`), one `gentle` spring for every sheet. Two ways to drive it: imperative (`useSheet` — **destructure** it, `const { ref: birthRef, present: openBirth } = useSheet()`, when the ref feeds a JSX `ref`; the React Compiler lint flags `<Sheet ref={sheet.ref}>`), or declarative for sheets that mount on demand (`<Sheet open onDismiss={unmount}>`, presents on mount). Inside a sheet use `BottomSheetTextInput` from gorhom for inputs that must stay above the keyboard, or our `TextField` for simple forms. Full-screen flows (camera, workout logger) are **routes** under `app/(modals)/` instead: `router.push("/(modals)/scan")`.
- **`SwipeToDelete`** `{ onDelete, deleteTestID?, deleteLabel?, radius?, enabled? }` — the one swipe-to-delete (UI-thread pan; short swipe snaps open on a tappable "Sil", long swipe / fling commits; the action stays in the a11y tree).
- **`UndoBar`** `{ message, onUndo, bottom }` — "Silindi · Geri al" bar above the tab bar; pair with `useUndoWindow(onCommit)` from `src/lib` (5 s window, commits on expiry / replacement / unmount, never on undo).
- **`ListRefreshControl`** `{ refreshing, onRefresh }` — themed pull-to-refresh for FlashList / ScrollView screens.
- **`TabBar`** / **`RouterTabBar`** — floating pill bar, spring indicator, selection haptic. `TAB_ITEMS` defines the 5 tabs; `useTabBarSpace()` gives the bottom clearance for custom scroll containers.

## Mascot (`src/mascot`)
- **`Floo`** `{ mood: "happy"|"cheer"|"think"|"sleepy"|"flex"|"worried", size: "s"(56)|"m"(96)|"l"(160)|number, animate=true }` — SVG flame-drop; idle breathing, random blink (3–5 s), flame-tip sway; mood = spring pose transition (`MOOD_POSE`). Set `animate={false}` in lists.
- **`SpeechBubble`** `{ text, tail: "left"|"right"|"none" }` — crossfades text, springs height.
- **`useMascot(context, seed?)`** → `{ mood, text, key, isLoading }`. Pass the composite's message as `seed` (e.g. `home.mascot`, `report.mascot`) to avoid a second request; otherwise it fetches `/mascot/message?context=` (5 min stale) and falls back to a calm default offline.

## Charts (`src/charts`)
- **`LineTrend`** `{ points: {dateKey, raw, ewma}[], goal?, unit, height=200, digits }` — Skia/victory-native: EWMA solid, raw as faded dots, dashed goal line, press-drag scrub with a haptic tick per point + tooltip. Renders an empty box under 2 points.
- **`RingChart`** `{ value, label, caption, size, tone }` — hero ring with a tabular number.
- **`BarWeek`** `{ days: {label,value,logged}[], target, todayIndex, height, format }` — 7 bars vs dashed target, staggered growth.
- **`Sparkline`** `{ values, width=84, height=28 }`.
- `chartMath.ts`: `niceDomain`, `ticks`, `nearestIndex`, `ewmaSeries`, `buildTrendSeries`, `barLayout`, `dateTickLabels` (pure, tested).

## Data layer (`src/lib`)
- **`getApi()`** — the typed `ApiClient` (never raw fetch). `setApi()` in tests. `EXPO_PUBLIC_API_FAKE=1` → `FakeApi` (login **eren / eren123**), which implements every route in `02-api-contract.md` in memory (`src/lib/fake/fakeFetch.ts` — add routes/fixtures there when your feature needs more; the fake runs *under* the real client so refresh/401/error mapping are exercised).
- **`queryClient`** — 30 s stale, 7 d gc, offline-first, MMKV-persisted (`AppQueryProvider`). Key convention: `["home"]`, `["program"]`, `["nutrition","day",dateKey]`… After a mutation call `useInvalidateHome()` (in `features/home/useHome.ts`) so the home composite refreshes.
- **`useSession()`** (zustand) — `status`, `user`, `signIn`, `setUser`, `signOut`, `boot`. `useSession(s => s.user)` for the profile.
- **`haptic`** — `tap / select / medium / success / warning / error` (no-ops on web, never throw).
- **`storage`** (MMKV) + `getJSON/setJSON`; **`STORAGE_KEYS`** — register new keys there (theme, session user, query cache, web tokens, workout draft).
- **`describeError(e, fallback)`** (`src/lib/errors.ts`) — the toast sentence for a failed write: offline / 429 / 503 get their own copy.
- **`format.ts`**, **`dates.ts`** (`todayKey`, `greetingFor`, `relativeDayLabel`, `weekdayName/Short`).

## Testing recipes (`__tests__/helpers.tsx`, `__tests__/mocks/expo-router.tsx`)
```tsx
import { renderUI, makeQueryClient } from "../helpers";          // Theme + Query + Toast providers
jest.mock("expo-router", () => jest.requireActual("../mocks/expo-router")); // mockRouter.push/replace spies
setApi(createFakeApi({ latencyMs: 0, signedIn: true }));          // deterministic data, no network
await renderUI(<MyScreen />, { queryClient: makeQueryClient() }); // ALL RNTL calls are async — await fireEvent too
```
Fake timers + `jest.advanceTimersByTime()` inside `act` drive reanimated springs; assert with `toHaveAnimatedStyle`.
Skeletons/sparklines are a11y-hidden → `getByTestId(id, { includeHiddenElements: true })`.
FlashList, expo-camera and expo-image are mocked globally in `jest.setup.js` (lists render eagerly); screens read the real Türkiye clock, so fixtures use `todayKey()` — never a pinned date.

## Do / Don't
- Do reuse `Card` + `Text` + `Chip` combos; the home cards (`features/home/components/*`) are reference implementations.
- Do keep skeleton heights in sync with the real card (`minHeight` on the card, same value in the skeleton).
- Do route CTAs with `router.push("/(tabs)/…")` / `"/(modals)/…"`; deep links `fitfloow://program` work automatically.
- Don't block the JS thread in gestures — Reanimated worklets only; no RN `Animated`.
- Don't show a skeleton when cached data exists; don't show spinners inside cards (use optimistic state).
- Don't add dependencies without asking; everything needed (sheet, list, camera, image, haptics, svg, skia) is installed.
