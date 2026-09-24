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
9. **Flat, one blue.** Cards cast no shadow: their hairline `colors.border` is the edge (`shadows.card` is empty on purpose). Only layers that float over content (sheets, toasts, the undo bar, a FAB) use `shadows.elevated` / `shadows.primary`. `colors.gradient` exists for **one** thing, the primary `Ring` (goal / calorie ring); everything else is a solid fill. In dark mode `onPrimary` is **navy** (`#04213A`), not white: text and icons on a primary fill always use `onPrimary` / `onPrimaryMuted`, never a raw white, and nothing on a non-primary dark background (camera scrim, off switch track) may use `onPrimary` as "white".

## Theme (`src/theme`)
| Export | What |
|---|---|
| `useTheme()` | `{ colors, scheme, isDark, mode, setMode, spacing, radii, type, shadows }`. Throws outside `ThemeProvider` (root layout provides it). |
| `useThemedStyles(t => ({...}))` | memoised style factory on the current scheme. |
| `colors.*` | semantic only: `bg surface surfaceElevated surfaceMuted ink inkMuted inkSubtle inkInverse primary primaryStrong primarySoft onPrimary onPrimaryMuted onPrimaryBorder gradient success/successSoft warning/warningSoft warningFill danger/dangerSoft border borderStrong controlBorder focus overlay onScrim skeleton skeletonHighlight ringTrack chartGrid tabBar tabBarBorder floo flooBubble flooBubbleBorder macroProtein macroCarbs macroFat`. On a `Card variant="primary"` use `<Text color="onPrimary">` / `"onPrimaryMuted"` (navy in dark) — never a raw white. `warning` is for text, `warningFill` for bars/marks. `controlBorder` (≥ 3:1 on bg, surface and surfaceElevated) edges inputs; `border` is the quiet card/row hairline. `floo` is decoration only, never text. `overlay` is **the scrim** (dims a photo, the live camera, or the screen behind a floating card; dark in both schemes); text and marks on it use **`onScrim`** (light in both schemes, AA on the scrim even over a white frame). The text pairs are enforced by `__tests__/theme/contrast.test.ts`. |
| `spacing` | 4-pt grid `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · xxxl 32 · huge 48`, `gutter 16`, `cardPad 16`, `cardGap 12`, `touch 44`, `rowMin 52`, `rowTall 68` |
| `radii` | `xs 6 · sm 10 · control 12 · md 14 · card 16 · sheet 24 · pill 999` |
| `type` | `caption 12 · label 13 · body 15 · bodyStrong 15 · title 17 · heading 20 · number 22 · display 28 · hero 44` |
| `statusTone` | maps API statuses (`ready/recovering/fatigued`, `ahead/onTrack/behind/stalled`) to a `Tone` |
| motion | `springs.snappy {18/260} · gentle {20/140} · bouncy {12/220}`, `durations {120/200/320}`, `timing.fast/base/slow/reduced`, `easeOut`, `easeOutStrong` (enter), `easeInOutStrong` (on-screen movement), `enterCard(i, reduce)`, `staggerDelay(i)`, `resolveSpring(kind, reduce)`, `PRESS_SCALE 0.97` |

Reduced motion: use `useReducedMotion()` from reanimated and `resolveSpring`/`timing.reduced` — every primitive already does.

## Primitives (`src/ui`)

### Layout
- **`Screen`** `{ scroll=true, keyboard, refreshing, onRefresh, tabBar=true, edges=["top"], contentStyle }` — safe areas, 16 pt gutters, `cardGap` (12) between children, pull-to-refresh, bottom clearance for the tab bar. `keyboard` swaps in `KeyboardAwareScrollView`. Do: one `Screen` per route. Don't: nest `ScrollView`s; for FlashList use `scroll={false}` + `List` and pad with `useTabBarSpace()`.
  - **Top bar (tab screens, `tabBar` true).** A flat bar (page colour + hairline, `insets.top + SCREEN_TOP_BAR` tall) fades in over the first 16 pt of scroll, tied to the scroll position, so rows never slide visibly under the corner Floo or the status bar. Scrolling screens get it from their own scroller; **list screens (`scroll={false}`) get it through `List`**, which attaches `useScreenScroll()` to vertical lists by itself. Another scroller inside a list screen calls `useScreenScroll()?.(e)` from its `onScroll`. Horizontal lists never drive it; modal screens (`tabBar={false}`) have none. The bar is drawn inside the screen and Floo one layer up (the tabs layout), so **nothing a screen draws can cover Floo** — don't add your own sticky header on top; if a screen needs one, give it the bar's height and colour.
- **`Header`** `{ title, subtitle?, eyebrow?, left?, right?: {icon,label,onPress}, compact?, trailing? }` — large 28 pt title (role=header); `compact` for sheets/modals. On a tab screen (Floo idle in the corner) the large header keeps `FLOO_CORNER_INSET` (52 pt) free on its right, so the title and the right action never run under Floo; `compact` headers and screens where Floo is hidden or off use the full width.
- **`Box`** spacing shorthands (`p px py pt pb pl pr m mx my mt mb gap`), `row wrap center align justify flex bg radius border`.
- **`Surface`** `{ elevated?, muted?, radius, bordered? }` themed plane, no padding. `elevated` is for floating layers only (it casts `shadows.elevated`).
- **`Card`** `{ variant: "default"|"primary"|"muted", onPress?, padded=true }` — flat: 16 pt radius, 16 pt padding, **no shadow**. `default` = `surface` + 1 pt `border` hairline; `muted` = `surfaceMuted`, no edge; `primary` = **solid** `primary` fill (no gradient, no glow), content in `onPrimary` / `onPrimaryMuted`, hairlines in `onPrimaryBorder`, actions as `Button variant="inverse"`. `onPress` makes the whole card a 0.98 pressable. Space cards with `spacing.cardGap`.
- **`Divider`** `{ inset? }` — 1 pt `border` line.
- **`Entry`** `{ index }` — staggered entering animation wrapper (Animated.View).
- **`Reveal`** `{ ready, skeleton }` — skeleton ⇄ content crossfade (see rule 1).

### Text & icons
- **`Text`** `{ variant, color (token), tone ("primary|success|warning|danger|neutral"), tabular, align, weight }` — dynamic type capped at 130 %.
- **`Icon`** `{ icon?: AppIcon, active?, name?: IconName, size=20, color: token|raw }` — **name a concept, not a glyph**: `<Icon icon="goal" />`, not `<Icon name="flag-outline" />`.
- **`src/ui/icons.ts`** — the semantic layer. `APP_ICONS` maps app concepts (`home program nutrition body profile · goal roadmap milestone pace lose maintain gain eta progress · weighIn measure height gender birthday activity trend · meal calories protein carbs fat energy deficit scan estimate online barcode photo camera · workout rest streak recovery skip start duration volume · username password displayName email logout theme mascot settings demo · report chart calendar today recent award · add minus edit delete close back forward expand next previous undo more refresh search check done warning info tip privacy`) to a glyph + its filled twin. **One visual weight: every glyph is an Ionicons outline, and filled is reserved for the active tab** — `__tests__/ui/icons.test.tsx` enforces both. The composite primitives (`Button`, `Chip`, `ListRow`, `Header`, `EmptyState`, `StatTile`, `TextField`) take `icon?: IconGlyph` = a concept *or* a raw glyph, so raw names still compile; prefer the concept, and add a new concept to the map rather than reaching for a glyph at the call site.

### Pressables
- **`Pressable`** `{ haptic: "tap"|"select"|"medium"|"none", scaleTo=0.97, minTarget=true, disabled }` — role=button, 44 pt min height, `accessibilityState.disabled`. Base of every interactive element. Don't use RN `Pressable`/`TouchableOpacity` directly.
- **`Button`** `{ label, variant: "primary"|"secondary"|"ghost"|"danger"|"inverse", size: "sm"|"md"|"lg", icon?, iconRight?, loading, full }` — heights **sm 40 · md 48 · lg 52**, radius `control` (12). Flat, no glow: `primary` = solid primary, darkens to `primaryStrong` while pressed (plus the 0.97 scale); `secondary` = `primarySoft` + primary text; `ghost` = transparent + `borderStrong` edge + ink text (pressed: `surfaceMuted`); `danger` = `dangerSoft` + danger text; `inverse` = `surface` pill + primary text, for use inside `Card variant="primary"` (correct in both schemes). `loading` shows a spinner, blocks presses, sets `busy`.
- **`Chip`** `{ label, selected, tone, icon?, dot?: color, size, onPress? }` — pill; selected = solid primary; `onPress` gives a selection haptic; `dot` for muscle colors.
- **`ListRow`** `{ label, value?, hint?, icon?, right?: node, onPress?, chevron, destructive, divider? }` — settings rows, min height `spacing.rowMin` (52), 32 pt soft icon tile; put `Toggle`/`Segmented`/`Stepper` in `right`. Group rows in one `Card` and pass `divider` on every row but the last: a hairline that starts at the text column (test id `${testID}-divider`).

### Controls
- **`TextField`** `{ label, error, hint, icon, secure, unit, ...TextInputProps }` — label above; idle edge `controlBorder` (≥ 3:1), on focus the edge turns `focus` and a 3 pt halo fades in outside it (opacity only, no layout shift); `danger` edge on error. Error line (live region), eye toggle. Forward-ref to `TextInput`.
- **`Stepper`** `{ value, onChange, step, min, max, format, size }` — flat −/+ tiles (`surfaceMuted` / `primarySoft`), `number` (22 pt) value, clamp, press-and-hold repeat, tabular value. Test ids: `${testID}-dec/-inc`.
- **`Segmented<T>`** `{ options: {value,label}[], value, onChange, size }` — flat `surfaceMuted` track, hairline-edged thumb (one step lighter than the track in dark) on a spring, no shadow; role=tablist/tab, test ids `${testID}-${value}`.
- **`Toggle`** `{ value, onChange }` — role=switch, `checked` state, track springs from `borderStrong` to `primary`; the knob is white / near-white ink in both schemes (never `onPrimary`).
- **`WheelPicker<T>`** `{ options: {value,label}[], value, onChange, label }` — snapping 44 pt column, one `onChange` + one selection tick per settle, `role=adjustable` with increment/decrement, and every row directly tappable. `WHEEL_ROW_HEIGHT` / `WHEEL_HEIGHT` exported.
- **`DatePicker`** `{ value: dateKey|null, onChange, label, minYear?, maxYear? }` — day / Turkish month / year as three wheels. A day that does not exist in the new month clamps, so it can never emit an impossible date. Use this for any date input; **never a text field asking for `YYYY-AA-GG`**.

### Progress
- **`ProgressBar`** `{ value 0..1, tone, height=8, label?, valueLabel? }` — flat pill (use 6–8), `ringTrack` groove, solid fill (`warning` fills with `warningFill`), spring-animated width, role=progressbar with `accessibilityValue`.
- **`Ring`** `{ value 0..1, size=120, stroke?, tone, color?, gradient=true, trackColor?, children }` — SVG ring, round caps, animated dash offset; children centred. `tone="primary"` strokes with `colors.gradient`, **the app's only gradient**. `ringGeometry()` is exported for maths.
- **`StatTile`** `{ label, value, hint?, icon?, tone? }` — flat `surfaceMuted` tile, `number` (22 pt) tabular value (streaks, deltas).
- **`CountUp`** `{ value, format, from=0, duration=600, ...TextProps }` — a number that counts to its new value (600 ms ease-out, a Reanimated timing on the UI thread) from the number on screen, never from zero again; a value that changes mid-count carries on from where the count is. The first mount counts from `from`: pass the value itself (`from={value}`) on screens visited many times a day, so only a *change* counts (the home calorie number does this, like the `Ring` beside it, which does not fill on mount either). Reduced motion and Jest show the final value; the accessibility label is always the final value. Tabular by default. `useCountUp(value, { from, duration, animate })` is the same engine for custom text.

### Feedback
- **`useToast().show({ message, kind: "success"|"error"|"info", duration })`** — top toast, flat `surfaceElevated` + hairline + `shadows.elevated`, haptic per kind, auto-hides, tap to dismiss, role=alert. Provided at the root. `useToast().route(claim)` lets another channel (Floo) claim toasts first; the claimer returns `true` to take one.
- **`EmptyState`** `{ title, body?, icon?, illustration?, action?: {label,onPress,icon}, compact }` — pass `illustration={<Floo mood="sleepy" size="m" />}` for empty data, `mood="worried"` for errors.
- **`SuccessCheck`** `{ size=72, withHaptic=true }` — circle pops from 0.6 with a fade (bouncy, never from 0) + check draws (320 ms, strong ease-out). Use in completion sheets.
- **`Skeleton`** `{ width, height, radius=8, circle }`, **`SkeletonText`** `{ lines, lineHeight, lastWidth }`, **`SkeletonGroup`** — 1.2 s diagonal shimmer, hidden from screen readers (query with `includeHiddenElements: true` in tests).

### Sheets & navigation
- **`Sheet`** (gorhom v5) `{ title?, padded=true, open?, ...BottomSheetModalProps }` + `useSheet()` → `{ ref, present, dismiss }`; **`SheetActions`** button row. Dynamic sizing, dimmed backdrop, drag handle, keyboard-aware (`interactive`), one `gentle` spring for every sheet. Two ways to drive it: imperative (`useSheet` — **destructure** it, `const { ref: birthRef, present: openBirth } = useSheet()`, when the ref feeds a JSX `ref`; the React Compiler lint flags `<Sheet ref={sheet.ref}>`), or declarative for sheets that mount on demand (`<Sheet open onDismiss={unmount}>`, presents on mount). Inside a sheet use `BottomSheetTextInput` from gorhom for inputs that must stay above the keyboard, or our `TextField` for simple forms. Full-screen flows (camera, workout logger) are **routes** under `app/(modals)/` instead: `router.push("/(modals)/scan")`.
- **`SwipeToDelete`** `{ onDelete, deleteTestID?, deleteLabel?, radius?, enabled? }` — the one swipe-to-delete (UI-thread pan; short swipe snaps open on a tappable "Sil", long swipe / fling commits; the action stays in the a11y tree).
- **`UndoBar`** `{ message, onUndo, bottom }` — "Silindi · Geri al" bar above the tab bar; pair with `useUndoWindow(onCommit)` from `src/lib` (5 s window, commits on expiry / replacement / unmount, never on undo).
- **`ListRefreshControl`** `{ refreshing, onRefresh }` — themed pull-to-refresh for FlashList / ScrollView screens.
- **`TabBar`** / **`RouterTabBar`** — docked and flat: an opaque `tabBar` surface with one `tabBarBorder` hairline on top (no float, no glow), `TAB_BAR_HEIGHT` (56) plus the bottom inset. The active tab gets a `primarySoft` pill behind its icon that slides over on the snappy spring, the filled glyph (the only filled icons in the app) and a bold `primary` label; the icon lifts 1 → 1.04 (snappy, no wobble: tabs switch dozens of times a day). Reduced motion: 150 ms timings, no lift. Selection haptic on switch, none on the active tab. `TAB_ITEMS` defines the 5 tabs; `useTabBarSpace()` gives the bottom clearance for custom scroll containers. Scenes shift sideways on native (fade under reduced motion) and swap without animation on web (see `app/(tabs)/_layout.tsx`).

## The goal, shared (`src/features/goals`)
The goal decision is one component used in two places, so onboarding and in-app setup cannot drift:
- **`goalIntent.ts`** (pure) — `INTENT_OPTIONS` (`lose | maintain | gain`), `PACE_OPTIONS`, `ON_TRACK_TR`, `milestonesOf(plan)` / `summaryOf(plan)` (C4, with a local fallback for plans cached before it), `dateLocativeTr` ("17 Ocak'ta"), `etaBetweenTr(from,to)`, `maintenanceEnergy(body)` / `gainCalories(maintenance)`.
- **`components/GoalChooserSection`** — intent → target → pace → consequence. Rendered by `GoalSetupScreen` *and* onboarding step 5.
- **`components/PlanOutcome`** — "what that choice means", arrival **date** as the hero. `components/MilestoneSpine` — the four quarter-points, `compact` (inside the blue card) or `full` (the roadmap's spine).
- **`useLocalPlan.usePlansByPace`** — all three paces computed on device, so the pace picker shows each option's real arrival date and daily calories.

## Onboarding (`src/features/onboarding`)
One route (`app/(onboarding)`), one draft, one step machine. `model.ts` owns the steps, the per-field errors and the `POST /onboarding` payload; `draft.ts` writes everything except the password to MMKV after every change, so a crash resumes where it left off. The root layout gates on `needsOnboarding(user)` (`api.ts`) — strictly `onboardingCompleted === false`, so an account cached before the field existed is never sent back through the flow.

## Mascot (`src/mascot`)
- **`Floo`** `{ mood: "happy"|"cheer"|"think"|"sleepy"|"flex"|"worried"|…, size: "s"(56)|"m"(96)|"l"(160)|number, animate=true, trigger?, pointAt? }` — the v1 prop signature drawing Floo 3 (`model/FlooModel`); `toFlooMood` maps the ten API moods onto the model's nine. `trigger={{ name, key }}` plays a beat (change the key to replay), `pointAt={{ x, y }}` points the nearer hand at a spot in its own box. Falls back to the SVG Floo on web if CanvasKit never loads. Set `animate={false}` in lists.
- **Floo's voice** (`mascot/voice`): `useFloo().say({ text, mood?, trigger?, priority?, tone?, action?, dedupeKey? })` queues one bubble for the top-right Floo (`FlooCornerHost`, Floo 3 at badge detail, 40 px). Moods and triggers are the model's (`model/params.ts`); an API mood goes through `toFlooMood` first. `useFlooOnce(key, msg)` for lines that come from state (once per key).
  - **Where Floo sits.** One host per navigator layer: the tabs layout mounts `presence="idle"` (visible at rest, survives tab switches), the modal stack `"auto"` (slides in only while it has something to say); `useFlooPresence("hidden")` on a screen that owns its own big Floo or is full-bleed (onboarding, camera). Geometry: `FLOO_CORNER_SIZE` 40, top at `insets.top + FLOO_CORNER_TOP` (4), right gutter; headers keep `FLOO_CORNER_INSET` free (see `Header`), and the screen top bar (see `Screen`) sits under it.
  - **Motion.** The corner Floo slides in 28 pt from the edge on the snappy spring (0.9 → 1 scale with opacity, never from 0). The bubble grows out of Floo (origin top-right, 0.94 → 1, 240 ms strong ease-out) and leaves faster than it came (140 ms, 4 pt up); flick it up or tap it away, and a finger resting on it holds its timer. Reduced motion: 150 ms fades, no travel.
  - **What goes where.** Warnings and things to act on are Floo's lines (error toasts are routed to Floo while it can be seen); neutral confirmations (saved, deleted, undo) stay `Toast` / `UndoBar`. With the mascot switched off, Floo's lines fall back to toasts.
- **Floo events** (`mascot/events.ts`): the data layer calls `flooBus.emit("mealLogged" | "workoutDone" | …, payload)` after a successful write; `FlooEventBridge` (mounted once in `app/_layout.tsx`) turns each event into one line with its mood and gesture (`describeFlooEvent`). Emit, don't also `say()` the same thing. "Over target" is keyed by day (`overTargetKey`) and shared with `useFlooOnce`, so the home screen never repeats it.
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
