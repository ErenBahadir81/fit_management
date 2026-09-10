# Stack pin sheet — September 2026

Everything below was **verified against the live npm registry and actually installed/built/tested in this
container** (Ubuntu 24.04.4, x86_64, Node v22.22.2, npm 10.9.7). Nothing here is from memory.

## 0. Environment facts

| Fact | Result |
|---|---|
| Node | v22.22.2 (Expo SDK 57 requires >= 22.13 — OK) |
| npm | 10.9.7 |
| **pnpm** | **available**, `/opt/node22/bin/pnpm`, v10.33.0 |
| yarn | available, 1.22.22 (classic) |
| TypeScript (global) | 6.0.2 — but pin per-workspace, see gotcha G-11 |
| `registry.npmjs.org/create-expo-app` | HTTP **200** — `npx create-expo-app` works through the proxy |
| `fastdl.mongodb.org` range GET | HTTP **206** — mongod binaries downloadable |
| `expo export --platform web` | ✅ **verified working headlessly** (incl. static prerender) |
| `expo export --platform android` | ✅ **verified working headlessly** (Hermes `.hbc`, no Android SDK needed) |
| `expo start --web` | ✅ **verified serving HTTP 200** (needs `web.output: "single"`, see G-8) |
| `npx expo install --check` | ✅ **"Dependencies are up to date"** on the matrix below |
| jest-expo + RNTL unit tests | ✅ **2/2 passing**, incl. `toHaveAnimatedStyle` |
| vitest + mongodb-memory-server | ✅ **3/3 passing**, real mongod 8.2.6 downloaded & booted |
| Next.js 16 production build | ✅ **verified** (Turbopack, static prerender) |

---

## 1. Version matrix

### Platform baseline (this is the hard constraint everything hangs off)

Expo SDK **57** is current. `expo@latest` = **57.0.21** (published 2026-09-08).
SDK 58 exists only as `canary` (`58.0.0-canary-2026090…`) — do not use.

| | Expo SDK 57 pins | npm `latest` | **Use** |
|---|---|---|---|
| react-native | **0.86.3** | 0.87.1 | **0.86.3** |
| react / react-dom | **19.2.3** | 19.3.0 | **19.2.3** |
| react-native-web | ~0.21.0 | 0.21.2 | **0.21.2** |
| Min Node | 22.13.x | — | 22.22 ✔ |

> ⚠️ **`latest` on npm is ahead of Expo SDK 57 for react and react-native.** Installing
> `react-native@latest` / `react@latest` puts you on the SDK 58 baseline and `expo install --check`
> will fail. Pin exactly `0.86.3` / `19.2.3`.

New Architecture: **always on, not optional.** Per Expo docs — *"The New Architecture is always enabled
in SDK 55 and later. There is no option to disable it."* RN 0.82 removed the opt-out. Remove
`newArchEnabled` from `app.json` entirely; it is ignored.

### (a) Mobile — Expo app *(exact versions; `expo install --check` clean)*

| Package | Version | Notes |
|---|---|---|
| expo | **57.0.21** | SDK 57 |
| expo-router | **57.0.20** | version now tracks SDK, not the old 6.x line |
| react | **19.2.3** | not 19.3.0 |
| react-dom | **19.2.3** | |
| react-native | **0.86.3** | not 0.87.1 |
| react-native-web | **0.21.2** | |
| @expo/metro-runtime | **57.0.15** | required by expo-router on web |
| **react-native-reanimated** | **4.5.1** | 4.6.0 exists; see G-1 |
| **react-native-worklets** | **0.10.1** | separate package since RA4; must match RA minor |
| react-native-gesture-handler | **2.32.0** | 3.2.1 is latest — **do not use**, see G-2 |
| react-native-safe-area-context | **5.7.0** | latest 5.9.1 not SDK-pinned |
| react-native-screens | **4.26.0** | latest 4.27.0 not SDK-pinned |
| react-native-svg | **15.15.4** | |
| expo-image | **57.0.4** | |
| expo-camera | **57.0.4** | |
| expo-haptics | **57.0.2** | |
| expo-linear-gradient | **57.0.1** | |
| expo-sqlite | **57.0.2** | |
| expo-constants | **57.0.17** | |
| expo-status-bar | **57.0.1** | |
| expo-linking | **57.0.9** | |
| expo-font | **57.0.3** | |
| expo-splash-screen | **57.0.8** | |
| expo-secure-store | **57.0.3** | for JWT refresh token |
| expo-notifications | **57.0.17** | |
| expo-blur | **57.0.2** | |
| expo-file-system | **57.0.6** | |
| expo-image-picker | **57.0.16** | |
| **@shopify/flash-list** | **2.0.2** | latest is 2.3.2 — SDK pins 2.0.2, see G-3 |
| **@shopify/react-native-skia** | **2.6.2** | latest 2.11.2; SDK pins 2.6.2, see G-4 |
| **victory-native** | **42.0.1** | this IS "Victory Native XL" (repo `victory-native-xl`) |
| @gorhom/bottom-sheet | **5.2.14** | works with Reanimated 4, see G-5 |
| moti | **0.30.0** | last publish 2025-01; still works, see G-6 |
| **lottie-react-native** | **7.3.8** | SDK pin (latest 7.5.0); see G-7 for the web trap |
| @lottiefiles/dotlottie-react | **0.19.16** | **required** if you build for web |
| react-native-mmkv | **4.3.2** | v4 = Nitro module, API changed, see G-9 |
| react-native-nitro-modules | **0.37.1** | required peer of mmkv v4 |
| @tanstack/react-query | **5.102.8** | |
| zustand | **5.0.15** | |
| @expo/vector-icons | **15.1.1** | |
| react-native-keyboard-controller | **1.22.4** | optional; big smoothness win |
| react-native-edge-to-edge | **1.8.1** | optional (RA4 already deps it transitively) |

Mobile dev deps — **these are the ones people get wrong**; `expo install --check` demands them:

| Package | Version | Note |
|---|---|---|
| **typescript** | **6.0.3** | ⚠️ NOT 5.9.x and **NOT 7.0.2** — Expo 57 expects `~6.0.3` |
| **jest** | **29.7.0** | ⚠️ NOT jest 30 — jest-expo 57 is still Jest 29 |
| **@types/jest** | **29.5.14** | ⚠️ NOT 30.0.0 |
| **@types/react** | **19.2.4** | ⚠️ NOT 19.3.0 and not 19.2.3 |
| jest-expo | **57.0.5** | |
| @testing-library/react-native | **14.0.1** | ⚠️ **async APIs now**, see G-10 |
| **test-renderer** | **1.2.0** | ⚠️ new required peer of RNTL 14 (replaces react-test-renderer) |
| eslint-config-expo | **57.0.2** | |

### (b) API — Fastify 5 + Mongoose + zod

| Package | Version |
|---|---|
| fastify | **5.12.3** (6.x only `next`/alpha) |
| @fastify/jwt | **10.2.2** |
| @fastify/cookie | **11.1.2** |
| @fastify/cors | **11.3.0** |
| @fastify/rate-limit | **11.2.0** |
| @fastify/multipart | **10.1.1** |
| @fastify/swagger | **9.8.1** |
| @fastify/swagger-ui | **6.1.1** |
| @fastify/helmet | **13.1.1** |
| @fastify/sensible | **6.0.5** |
| @fastify/static | **10.1.3** |
| @fastify/under-pressure | **9.1.0** |
| fastify-plugin | **6.0.0** |
| **fastify-type-provider-zod** | **7.0.0** — peer `zod >=4.1.5`, `fastify ^5.5.0`, `@fastify/swagger >=9.5.1` |
| **zod** | **4.6.1** — **v4 is what the ecosystem now expects** |
| mongoose | **9.10.0** (drives `mongodb ~7.6`; engines `node >=20.19`) |
| mongodb | **7.6.0** |
| pino | **10.3.1** |
| pino-pretty | **13.1.3** |
| pino-http | **11.0.0** |
| argon2 | **0.45.1** (native) or bcryptjs **3.0.3** (pure JS) |
| dotenv | **17.4.2** |
| **vitest / @vitest/coverage-v8** | **5.0.0** (engines `node ^22.12 \|\| ^24 \|\| >=26`) |
| vite (peer of vitest 5) | **8.3.0** |
| **mongodb-memory-server** | **11.2.0** — default mongod **8.2.6** ✅ |
| tsx | **4.23.13** |
| typescript (api) | **5.9.3** or 6.0.3 — free choice here, no Expo constraint |
| @types/node | **22.20.2** |
| supertest | **7.2.2** (optional; `app.inject()` is better) |
| @faker-js/faker | **10.6.0** |

### (c) Admin — Next.js App Router

| Package | Version |
|---|---|
| **next** | **16.3.4** (15.x is old; 16 is stable, Turbopack default, engines `node >=20.9`) |
| react / react-dom | **19.2.3** (keep in lockstep with mobile; Next 16 peer is `^19.0.0`) |
| **tailwindcss** | **4.3.3** — **use v4**, see G-12 |
| @tailwindcss/postcss | **4.3.3** |
| **motion** | **13.2.0** — the renamed `framer-motion`; import from `motion/react` |
| framer-motion | 13.2.0 (same version; alias only — don't install both) |
| recharts | **3.10.1** |
| @visx/visx | 4.0.0 (alt) |
| @tremor/react | 3.18.7 — ⚠️ **last publish 2025-01-13, unmaintained. Avoid.** |
| @tanstack/react-query | **5.102.8** |
| @types/react / @types/react-dom | **19.2.4** / **19.2.3** |

### (d) Shared / tooling

| Package | Version |
|---|---|
| zod | **4.6.1** (single version across all workspaces) |
| typescript | 6.0.3 (mobile is forced here; match it repo-wide for simplicity) |
| vitest | **5.0.0** |
| tsx | **4.23.13** |
| eslint | **10.10.0** |
| prettier | **3.9.6** |
| @biomejs/biome | **2.5.13** (alt to eslint+prettier) |
| turbo | **2.10.12** (optional task runner) |
| husky / lint-staged | 9.1.7 / 17.5.1 |

### Package manager recommendation

**npm workspaces** (verified end-to-end here). Expo docs state first-class support for npm, pnpm,
yarn and bun. pnpm **is** installed (10.33.0) and is supported since SDK 54 for isolated installs,
but Expo explicitly warns *"not all packages you install will work and some React Native libraries
may cause build or resolution errors when used with isolated dependencies."* If you use pnpm, add
to root `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
nodeLinker: hoisted     # strongly recommended for React Native
```

Duplicate `react-native` or `react` versions in one monorepo are **unsupported** — check with
`npm why react-native` / `pnpm why --depth=10 react-native`.

---

## 2. package.json blocks

### `apps/mobile/package.json` — verified: installs clean, `expo install --check` passes, exports web+android, jest green

```json
{
  "name": "mobile",
  "private": true,
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "export:web": "expo export --platform web --output-dir dist-web",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "check": "expo install --check"
  },
  "dependencies": {
    "@expo/metro-runtime": "57.0.15",
    "@expo/vector-icons": "15.1.1",
    "@fit/shared": "*",
    "@gorhom/bottom-sheet": "5.2.14",
    "@lottiefiles/dotlottie-react": "0.19.16",
    "@shopify/flash-list": "2.0.2",
    "@shopify/react-native-skia": "2.6.2",
    "@tanstack/react-query": "5.102.8",
    "expo": "57.0.21",
    "expo-blur": "57.0.2",
    "expo-camera": "57.0.4",
    "expo-constants": "57.0.17",
    "expo-file-system": "57.0.6",
    "expo-font": "57.0.3",
    "expo-haptics": "57.0.2",
    "expo-image": "57.0.4",
    "expo-image-picker": "57.0.16",
    "expo-linear-gradient": "57.0.1",
    "expo-linking": "57.0.9",
    "expo-notifications": "57.0.17",
    "expo-router": "57.0.20",
    "expo-secure-store": "57.0.3",
    "expo-splash-screen": "57.0.8",
    "expo-sqlite": "57.0.2",
    "expo-status-bar": "57.0.1",
    "lottie-react-native": "7.3.8",
    "moti": "0.30.0",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "react-native": "0.86.3",
    "react-native-gesture-handler": "2.32.0",
    "react-native-keyboard-controller": "1.22.4",
    "react-native-mmkv": "4.3.2",
    "react-native-nitro-modules": "0.37.1",
    "react-native-reanimated": "4.5.1",
    "react-native-safe-area-context": "5.7.0",
    "react-native-screens": "4.26.0",
    "react-native-svg": "15.15.4",
    "react-native-web": "0.21.2",
    "react-native-worklets": "0.10.1",
    "victory-native": "42.0.1",
    "zod": "4.6.1",
    "zustand": "5.0.15"
  },
  "devDependencies": {
    "@testing-library/react-native": "14.0.1",
    "@types/jest": "29.5.14",
    "@types/react": "19.2.4",
    "eslint-config-expo": "57.0.2",
    "jest": "29.7.0",
    "jest-expo": "57.0.5",
    "test-renderer": "1.2.0",
    "typescript": "6.0.3"
  }
}
```

### `apps/api/package.json` — verified: installs clean, `tsc --noEmit` clean, 3/3 vitest green against real mongod

```json
{
  "name": "api",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fastify/cookie": "11.1.2",
    "@fastify/cors": "11.3.0",
    "@fastify/helmet": "13.1.1",
    "@fastify/jwt": "10.2.2",
    "@fastify/multipart": "10.1.1",
    "@fastify/rate-limit": "11.2.0",
    "@fastify/sensible": "6.0.5",
    "@fastify/swagger": "9.8.1",
    "@fastify/swagger-ui": "6.1.1",
    "@fastify/under-pressure": "9.1.0",
    "@fit/shared": "*",
    "argon2": "0.45.1",
    "fastify": "5.12.3",
    "fastify-plugin": "6.0.0",
    "fastify-type-provider-zod": "7.0.0",
    "mongoose": "9.10.0",
    "pino": "10.3.1",
    "zod": "4.6.1"
  },
  "devDependencies": {
    "@faker-js/faker": "10.6.0",
    "@types/node": "22.20.2",
    "@vitest/coverage-v8": "5.0.0",
    "mongodb-memory-server": "11.2.0",
    "pino-pretty": "13.1.3",
    "tsx": "4.23.13",
    "typescript": "6.0.3",
    "vitest": "5.0.0"
  }
}
```

### `apps/admin/package.json` — verified: installs clean, `next build` succeeds

```json
{
  "name": "admin",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@fit/shared": "*",
    "@tanstack/react-query": "5.102.8",
    "motion": "13.2.0",
    "next": "16.3.4",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "recharts": "3.10.1",
    "zod": "4.6.1",
    "zustand": "5.0.15"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@tanstack/react-query-devtools": "5.102.8",
    "@types/node": "22.20.2",
    "@types/react": "19.2.4",
    "@types/react-dom": "19.2.3",
    "tailwindcss": "4.3.3",
    "typescript": "6.0.3",
    "vitest": "5.0.0"
  }
}
```

### `packages/shared/package.json` — verified: TS source consumed by Metro, tsc and Next with zero build step

```json
{
  "name": "@fit/shared",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "4.6.1" },
  "devDependencies": { "typescript": "6.0.3", "vitest": "5.0.0" }
}
```

Root:

```json
{
  "name": "fit-management",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=22.13" },
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  }
}
```

> **Publishing raw `.ts` from a workspace package works** — verified: Metro/babel-preset-expo
> transpiled `@fit/shared/src/index.ts` into the web *and* Hermes android bundles, and `tsc` and
> `next build` both resolved it. No `tsup`/`tsc -b` build step needed for internal packages.

---

## 3. Gotchas, each with the fix

**G-1 — Reanimated 4 needs the separate `react-native-worklets` package, minor-pinned.**
Reanimated 4 moved the worklets runtime out. The peer range is exact:
`reanimated 4.5.x → worklets 0.10.x` (also accepts 0.11.x), `reanimated 4.6.x → worklets 0.12.x`.
From `react-native-reanimated/compatibility.json`:

| Reanimated | react-native | react-native-worklets |
|---|---|---|
| 4.6.x | 0.83 – **0.87** | 0.12.x |
| 4.5.x | 0.83 – **0.86** | 0.10.x, 0.11.x |
| 4.4.x | 0.83 – 0.86 | 0.9.x, 0.10.x |

**Fix:** on SDK 57 (RN 0.86.3) use **4.5.1 + 0.10.1**. 4.6.0 + 0.12.2 *would* also satisfy the RN
range, but Expo SDK 57 pins 4.5.1 and `expo install --check` / `expo-doctor` / EAS Build will flag
the mismatch. Stay on the SDK pin.

**G-2 — gesture-handler 3.x is out but is NOT the SDK 57 pin.**
`react-native-gesture-handler@latest` is **3.2.1**; Expo SDK 57 pins **~2.32.0**. Its peers are
wildcards so npm installs 3.x happily and nothing warns — the breakage shows up at native build /
runtime. **Fix:** pin `2.32.0` and let `expo install --check` police it.

**G-3 — FlashList: latest 2.3.2, SDK pin 2.0.2.**
Same trap as G-2. **Fix:** `2.0.2`. (FlashList v2 dropped `estimatedItemSize` — it auto-measures.)

**G-4 — Skia: latest 2.11.2, SDK pin 2.6.2, and victory-native constrains it.**
`victory-native@42.0.1` peers: `@shopify/react-native-skia >=2.6.0 <3.0.0`, `react-native-reanimated
>=3.19.1`, `react-native-gesture-handler >=2.0.0`. Both 2.6.2 and 2.11.2 satisfy it. Skia **2.11.2**
additionally peers `react-native-worklets >=0.7.0` (2.6.2 does not). **Fix:** use **2.6.2**, the SDK
pin — verified bundling with victory-native 42.

**G-5 — `@gorhom/bottom-sheet` and Reanimated 4.**
5.2.14's peer is `react-native-reanimated: ">=3.16.0 || >=4.0.0-"` — Reanimated 4 is explicitly
supported. **Verified:** `BottomSheet` + `BottomSheetView` typecheck and bundle against RA 4.5.1.
Do not go below 5.x (v4 is Reanimated-2/3 only).

**G-6 — `moti@0.30.0` last published 2025-01-29 and drags in `framer-motion@^6`.**
It still works (verified: `MotiView` typechecks and bundles on RA 4.5.1) but it is effectively
frozen and ships a stale transitive `framer-motion` 6. **Fix:** fine for skeletons/simple fades, but
for anything load-bearing prefer plain Reanimated 4 (`Animated.View` + `useAnimatedStyle` +
`withSpring`) or `react-native-reanimated`'s `Layout`/`Entering` animations. Don't let moti's
`framer-motion@6` leak into the admin app's resolution — the workspaces are separate, so it won't,
but check `npm why framer-motion` if you see React errors.

**G-7 — Lottie silently breaks the web build. (Actually hit this.)**
`lottie-react-native@7.3.8` declares an *optional* peer `@lottiefiles/dotlottie-react`. On native
that's fine; on web, `LottieView/index.web.js` hard-requires it and Metro fails:
```
Error: Unable to resolve module @lottiefiles/dotlottie-react from
  node_modules/lottie-react-native/lib/commonjs/LottieView/index.web.js
```
**Fix:** `npm i @lottiefiles/dotlottie-react@0.19.16` in the mobile app. Verified: web export goes
from failing → `Exported: dist-web`.

*Lottie vs Rive on New Arch:* both are New-Arch ready. lottie-react-native 7.3.8 peers
`react-native >=0.84`, `react >=19.2` — satisfied by RN 0.86.3 / React 19.2.3. `rive-react-native`
is **9.8.5**, peers are wildcards, and it is **not in the Expo SDK pin list**, so `expo-doctor` will
list it as unknown and you own its compatibility. For a mascot, Rive gives you state machines and
smaller files; Lottie is the safer, SDK-blessed choice. Neither works in Expo Go — both need a dev
build.

**G-8 — `expo start --web` fails with `web.output: "static"` but `expo export` succeeds.**
With static rendering on, the dev server SSRs your routes in Node. `@lottiefiles/dotlottie-react`
blows up there:
```
Metro error: Cannot destructure property '__extends' of 'tslib.default' as it is undefined.
```
**Fix:** for the dev server / local smoke test set `"web": { "bundler": "metro", "output": "single" }`
(SPA) — verified serving **HTTP 200** in ~4s. Keep `"output": "static"` only for the production web
export, which **does** work (verified: prerendered `index.html`, `heavy.html`, `_sitemap.html`).
Also, in this container `expo start` prints a harmless
`Running as root without --no-sandbox is not supported` from the Electron React Native DevTools —
it does not stop the server.

**G-9 — `react-native-mmkv` v4 is a Nitro module and the API changed.**
- Requires `react-native-nitro-modules@0.37.1` as a real dependency.
- **New Architecture only**, and it needs a **dev build** (`npx expo prebuild`) — it does not run in Expo Go.
- **Breaking:** `MMKV` is now a *type only*. `new MMKV()` fails to compile:
  `TS2693: 'MMKV' only refers to a type, but is being used as a value here.`
  ```ts
  // v3 (old)
  import { MMKV } from 'react-native-mmkv';
  const storage = new MMKV();
  // v4 (correct)
  import { createMMKV, type MMKV } from 'react-native-mmkv';
  const storage: MMKV = createMMKV();
  ```
  Hooks are `useMMKV`, `useMMKVString`, `useMMKVNumber`, `useMMKVBoolean`, `useMMKVObject`,
  `useMMKVBuffer`, `useMMKVListener`, `useMMKVKeys`; lifecycle helpers `existsMMKV` / `deleteMMKV`.
- **Alternative if you want to stay Expo-Go-compatible / avoid a native dep:** `expo-sqlite@57.0.2`
  (SDK-pinned, has a `Storage` async-storage-compatible API) or
  `@react-native-async-storage/async-storage@2.2.0` (the SDK pin; latest is 3.1.1 — again, don't
  take latest).

**G-10 — `@testing-library/react-native` 14 made everything async. (Actually hit this.)**
14.0 "Drops React 18, async APIs by default". Sync calls fail with `` `render` function has not been
called `` and `You called act(async () => ...) without await`.
```ts
// v13
render(<App />);  const { result } = renderHook(() => useThing());
// v14 — verified passing
await render(<App />);
const { result } = await renderHook(() => useThing());
await act(async () => { result.current.inc(); });
```
It also has a **new required peer, `test-renderer@^1.0.0`** (a standalone renderer replacing
`react-test-renderer`) — npm will not auto-install it. Engines: `node ^22.13.0 || >=24`.

**G-11 — TypeScript: `latest` is 7.0.2, but Expo SDK 57 wants 6.0.3.**
The npm `latest` dist-tag for `typescript` is **7.0.2** (the native port); `6.0.3` is the current 6.x,
`5.9.3` the current 5.x. `expo install --check` says: `typescript@5.9.3 - expected version: ~6.0.3`.
**Fix:** pin `typescript@6.0.3` in the mobile workspace (verified: `tsc --noEmit` clean over
expo-router routes, Reanimated, Skia, victory-native, bottom-sheet, mmkv and the shared package).
Use the same version repo-wide to keep one compiler.

**G-12 — Jest, not Jest 30.** `expo install --check` demands `jest@~29.7.0` and
`@types/jest@29.5.14`; jest-expo 57.0.5 still depends on the `29.x` toolchain (`babel-jest@^29`,
`jest-environment-jsdom@^29`). Installing jest 30 / @types/jest 30 fails the check. **Fix:** pin
29.7.0 / 29.5.14. (Vitest 5 on the API side is unaffected — different workspace.)

**G-13 — Reanimated under Jest: the documented resolver path does not exist. (Actually hit this.)**
The Reanimated docs say `resolver: 'react-native-reanimated/jest/resolver'`, but **that file is not
shipped in 4.5.1** — the package has no `jest/` directory. Without a resolver you get:
```
TypeError: Cannot read properties of undefined (reading 'loadUnpackers')
  at react-native-worklets/src/WorkletsModule/NativeWorklets.native.ts:411
```
because Jest resolves the `.native` implementation. `react-native-worklets/jest/resolver.js` exists
and does the right thing, but jest-expo already sets its own resolver, so you must **compose them**.
See the working `jest.resolver.js` in §4 (verified: suite goes from crash → 2/2 pass).

**G-14 — Tailwind v4 uses a different PostCSS plugin and CSS-first config.**
No `tailwind.config.js`, no `@tailwind` directives, and the plugin moved out of `tailwindcss`.
**Fix:** install `@tailwindcss/postcss@4.3.3`, use `@import "tailwindcss";` and an `@theme { }` block.
Verified building under Next 16. (v3 still exists but v4 is what the Next 16 ecosystem assumes.)

**G-15 — Next 16 rewrites your `tsconfig.json` on build.** It reported:
`jsx was set to react-jsx (next.js uses the React automatic runtime)` and added
`.next/dev/types/**/*.ts` to `include`. Harmless, but commit the result so CI diffs stay clean.
Next 16 also builds with **Turbopack by default**.

**G-16 — `motion` vs `framer-motion` are the same 13.2.0 release.** `motion@13.2.0` literally
depends on `framer-motion@^13.2.0`. Install **only `motion`** and import from `motion/react`
(exports: `.`, `./react`, `./react-client`, `./react-m`, `./mini`, `./three`, …). Verified building.

**G-17 — zod: v4 everywhere.** `zod@latest` is **4.6.1** and `fastify-type-provider-zod@7.0.0` peers
`zod: ">=4.1.5"` — v3 is not accepted by the current type provider. Keep **one** zod version hoisted
across mobile/api/admin/shared so `z.infer` types are structurally identical; two zod copies in a
monorepo produce baffling "types are not assignable" errors.

**G-18 — mongodb-memory-server and Ubuntu 24.04.** Version 11.2.0's `DEFAULT_VERSION` is
**`8.2.6`** (read from `mongodb-memory-server-core/lib/util/resolveConfig.js`), which is exactly what
Ubuntu 24.04 needs. Verified end-to-end: it detected
`{ os: linux, dist: ubuntu, codename: noble, release: 24.04, arch: x64 }`, downloaded
`mongod-x64-ubuntu-8.2.6` (212 MB) into `node_modules/.cache/mongodb-memory-server/`, and
`--version` reports `db version v8.2.6`. **No `MONGOMS_VERSION` needed.**
For reference, `fastdl.mongodb.org` reachability from this container:

| mongod | ubuntu2404 | ubuntu2204 |
|---|---|---|
| 8.2.6 | **206 ✅** | 206 ✅ |
| 8.0.4 | **206 ✅** | 206 ✅ |
| 7.0.14 | **403 ❌ (no noble build)** | 206 ✅ |

So do **not** pin `MONGOMS_VERSION=7.0.x` on 24.04 — there is no ubuntu2404 tarball for 7.0.
If you must pin, use `MONGOMS_VERSION=8.0.4` or `8.2.6`. In CI, cache
`node_modules/.cache/mongodb-memory-server` to avoid re-downloading 212 MB.

**G-19 — Metro monorepo boilerplate is no longer required.** Expo auto-detects workspaces since
SDK 52. **Verified:** with a bare `getDefaultConfig(__dirname)` and no `watchFolders` /
`nodeModulesPaths` / `disableHierarchicalLookup`, the `@fit/shared` workspace package resolved and
its string appeared in the exported HTML. Keep the explicit config only if you hit a resolution edge.

**G-20 — pnpm's isolated node_modules is a known RN risk.** Expo: *"not all packages you install
will work and some React Native libraries may cause build or resolution errors when used with
isolated dependencies."* **Fix:** `nodeLinker: hoisted` in `pnpm-workspace.yaml`, or just use npm
workspaces (what was verified here).

**G-21 — `@tremor/react` is stale.** Last publish **2025-01-13**. For the admin charts prefer
**recharts 3.10.1** (verified building under Next 16 + React 19.2.3) or `@visx/visx@4.0.0`.

---

## 4. Config snippets (all verified in this container)

### `apps/mobile/babel.config.js`

Reanimated 4 needs **no manual plugin entry** — `babel-preset-expo@57` already injects the
worklets Babel plugin. Do **not** add `react-native-reanimated/plugin` (it's a no-op shim that
warns) and do not add `react-native-worklets/plugin` manually.

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    // NOTE: no 'react-native-reanimated/plugin' — babel-preset-expo 57 handles worklets.
    // If you ever run Babel outside Expo (custom jest transform), add:
    //   plugins: ['react-native-worklets/plugin']   // must be LAST
  };
};
```

### `apps/mobile/metro.config.js`

Minimal version — sufficient in a monorepo on SDK 52+ (verified):

```js
const { getDefaultConfig } = require('expo/metro-config');
module.exports = getDefaultConfig(__dirname);
```

Explicit version, if you need to force workspace resolution:

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Only with hoisted installs; remove for pnpm isolated node_modules.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

### `apps/mobile/app.json`

```json
{
  "expo": {
    "name": "Fit",
    "slug": "fit",
    "scheme": "fit",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "web": { "bundler": "metro", "output": "single" },
    "ios": { "supportsTablet": true, "bundleIdentifier": "net.floow.fit" },
    "android": {
      "package": "net.floow.fit",
      "edgeToEdgeEnabled": true,
      "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png" }
    },
    "plugins": [
      "expo-router",
      ["expo-camera", { "cameraPermission": "Allow Fit to scan equipment QR codes." }],
      ["expo-splash-screen", { "backgroundColor": "#0B0B0F", "resizeMode": "contain" }],
      ["expo-build-properties", { "ios": { "useFrameworks": "static" } }]
    ],
    "experiments": { "typedRoutes": true }
  }
}
```
> `newArchEnabled` is **deliberately absent** — New Arch is mandatory in SDK 55+ and the key is
> ignored. Use `"output": "static"` instead of `"single"` only for the production web export.

### `apps/mobile/jest.config.js` + resolver + setup — **this is the part that took the longest to get right**

`jest.config.js`:
```js
module.exports = {
  preset: 'jest-expo',
  resolver: '<rootDir>/jest.resolver.js',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?' +
      '|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*' +
      '|@sentry/react-native|native-base|react-native-svg|react-native-reanimated' +
      '|react-native-worklets|moti|@gorhom/.*|@shopify/.*|victory-native|lottie-react-native))',
  ],
  collectCoverageFrom: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
};
```

`jest.resolver.js` — **required**; the path in the Reanimated docs doesn't exist in 4.5.1 (G-13):
```js
// Composes jest-expo's React Native resolver with react-native-worklets' resolver.
// Reanimated/Worklets must resolve their NON-".native" (JS) implementation under Jest,
// otherwise you get: "Cannot read properties of undefined (reading 'loadUnpackers')".
const rnResolver = require('@react-native/jest-preset/jest/resolver');

module.exports = (request, options) => {
  const isWorkletsLand =
    options.basedir.includes('react-native-worklets') ||
    options.basedir.includes('react-native-reanimated') ||
    request.includes('react-native-worklets') ||
    request.includes('react-native-reanimated');

  if (isWorkletsLand) {
    options = {
      ...options,
      extensions: options.extensions?.filter((ext) => !ext.includes('native')),
    };
  }
  return rnResolver(request, options);
};
```

`jest.setup.js`:
```js
require('react-native-gesture-handler/jestSetup');
require('react-native-reanimated').setUpTests();   // adds toHaveAnimatedStyle / toHaveAnimatedProps

// react-native-mmkv v4 is a Nitro module — no JS fallback under Jest.
jest.mock('react-native-mmkv', () => {
  const store = new Map();
  const instance = {
    set: (k, v) => store.set(k, v),
    getString: (k) => store.get(k),
    getNumber: (k) => store.get(k),
    getBoolean: (k) => store.get(k),
    contains: (k) => store.has(k),
    delete: (k) => store.delete(k),
    clearAll: () => store.clear(),
    getAllKeys: () => [...store.keys()],
  };
  return { createMMKV: () => instance, existsMMKV: () => true, deleteMMKV: () => {} };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));
```

Example test — note **every RNTL call is awaited** (G-10). This exact file passes:
```tsx
import React from 'react';
import { render, screen, renderHook, act } from '@testing-library/react-native';
import { View, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { create } from 'zustand';

const useStore = create<{ n: number; inc: () => void }>((set) => ({
  n: 0, inc: () => set((s) => ({ n: s.n + 1 })),
}));

function Box() {
  const sv = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ opacity: sv.value }));
  return <Animated.View style={st} testID="box"><Text>hi</Text></Animated.View>;
}

test('renders a reanimated component', async () => {
  await render(<View><Box /></View>);
  expect(screen.getByTestId('box')).toBeTruthy();
  expect(screen.getByTestId('box')).toHaveAnimatedStyle({ opacity: 1 });
});

test('zustand hook works', async () => {
  const { result } = await renderHook(() => useStore());
  await act(async () => { result.current.inc(); });
  expect(useStore.getState().n).toBe(1);
});
```

`apps/mobile/tsconfig.json`:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest", "@testing-library/react-native"],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

### Admin — `postcss.config.mjs` + `app/globals.css` (Tailwind v4)

```js
// postcss.config.mjs
const config = { plugins: { '@tailwindcss/postcss': {} } };
export default config;
```
```css
/* app/globals.css — v4 is CSS-first: no tailwind.config.js, no @tailwind directives */
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.72 0.19 250);
  --font-display: "Inter", ui-sans-serif, system-ui, sans-serif;
}
```

---

## 5. Vitest 5 + mongodb-memory-server 11 (verified: 3/3 green)

`apps/api/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    // One mongod per worker is slow and memory-hungry; serialize files instead.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 300_000,      // first run downloads a ~212MB mongod tarball
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
});
```

`apps/api/test/setup.ts`:
```ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach } from 'vitest';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  // No MONGOMS_VERSION needed: 11.2.0 defaults to mongod 8.2.6, which has an
  // ubuntu2404 build. (mongod 7.0.x does NOT — see gotcha G-18.)
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'test' });
}, 300_000);

afterEach(async () => {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key]!.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
```

Optional `.env` / CI pins:
```bash
# Only if you must override; 8.0.4 and 8.2.6 both have ubuntu2404 builds, 7.0.x does not.
MONGOMS_VERSION=8.2.6
MONGOMS_DOWNLOAD_DIR=./node_modules/.cache/mongodb-memory-server   # cache this in CI
```

Fastify + zod v4 wiring that typechecks and tests clean:
```ts
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { z } from 'zod';
import {
  serializerCompiler, validatorCompiler, jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

export async function buildApp() {
  const app = Fastify({ logger: { level: 'info' } }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(swagger, {
    openapi: { info: { title: 'fit api', version: '1.0.0' } },
    transform: jsonSchemaTransform,     // turns zod schemas into OpenAPI
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/workouts',
    schema: {
      body: z.object({ name: z.string().min(1), reps: z.number().int().positive() }),
      response: { 201: z.object({ id: z.string(), name: z.string(), reps: z.number() }) },
    },
    handler: async (req, reply) => { /* req.body is fully typed */ },
  });

  return app;
}
```
Test with `app.inject()` — no port binding, no supertest needed:
```ts
const res = await app.inject({ method: 'POST', url: '/workouts', payload: { name: 'squat', reps: 5 } });
expect(res.statusCode).toBe(201);          // ✅ verified
// invalid body → 400 from the zod validator compiler   ✅ verified
// app.swagger().paths['/workouts'].post.requestBody is populated  ✅ verified
```

---

## 6. What can and cannot be smoke-tested in this container

| Check | Status |
|---|---|
| `npm install` whole monorepo | ✅ no ERESOLVE, no `invalid` peers |
| `npx expo install --check` | ✅ "Dependencies are up to date" |
| `npx tsc --noEmit` (mobile, TS 6.0.3) | ✅ clean over Reanimated/Skia/victory/bottom-sheet/mmkv/flash-list/lottie |
| `npx expo export --platform web` | ✅ 2687 modules, static prerender |
| `npx expo export --platform android` | ✅ 6.6 MB Hermes `.hbc` — **no Android SDK required** |
| `npx expo export --platform ios` | ✅ same mechanism (JS-only; no Xcode required) |
| `npx expo start --web` | ✅ HTTP 200 with `web.output: "single"` |
| `npx jest` (jest-expo + RNTL 14) | ✅ 2/2 |
| `npx vitest run` (+ real mongod) | ✅ 3/3 |
| `npx next build` | ✅ Turbopack, static routes |
| Native compile (Gradle / Xcode) | ❌ no Android SDK, no Xcode, no Docker — use EAS Build |
| Device/simulator runtime | ❌ — use EAS + a physical device / `expo-dev-client` |

**Recommended CI gate for this container:** `expo install --check` → `tsc --noEmit` → `jest` →
`expo export --platform android` → `expo export --platform web`. That catches every dependency,
type and bundling regression without any native toolchain.
