# @fitfloow/mobile — Expo SDK 57 app

```
pnpm --filter @fitfloow/mobile start          # expo start (dev build required: mmkv/skia/keyboard-controller are native)
EXPO_PUBLIC_API_FAKE=1 pnpm --filter @fitfloow/mobile start   # demo mode, no backend (login eren / eren123)
EXPO_PUBLIC_API_URL=http://<host>:4000/api/v1                 # real API base URL
pnpm --filter @fitfloow/mobile test           # jest-expo + RNTL 14 (all APIs async)
pnpm --filter @fitfloow/mobile typecheck      # tsc 6.0.3
pnpm --filter @fitfloow/mobile export:web     # bundle smoke test → dist-web/
```

- Routes: `app/` (expo-router): `(auth)/login`, `(tabs)/{index,program,nutrition,body,profile}`, `(modals)/{scan,workout}`. Auth gate via `Stack.Protected` on the session status. Scheme `fitfloow://`.
- Code: `src/theme` tokens + motion, `src/ui` primitives (**read `src/ui/README.md` first**), `src/mascot` Floo, `src/charts`, `src/lib` (api, auth, query, storage, format, fake), `src/features/*` screens.
- Tests: `__tests__/**` mirror `src`; `__tests__/helpers.tsx` provides `renderUI`, `__tests__/mocks/expo-router.tsx` the router mock.
