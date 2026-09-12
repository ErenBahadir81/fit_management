# End-to-end browser checks

Jest and vitest mock the list, the camera and the navigator, so they cannot see a screen that
renders blank in a real browser. These checks drive the actual builds in Chromium against a real
API and assert what a person would look at: does the screen have content, do cards overlap, does
any request fail, is anything logged to the console.

## Run

```bash
bash scripts/e2e.sh          # starts API + admin + mobile web, runs both suites, tears down
```

Or against servers you already have running:

```bash
node e2e/mobile.e2e.mjs      # MOBILE_URL (default http://127.0.0.1:8082)
node e2e/admin.e2e.mjs       # ADMIN_URL  (default http://127.0.0.1:3000)
```

Environment: `CHROME_PATH`, `MOBILE_URL`, `ADMIN_URL`, `API_URL`, `E2E_USER`, `E2E_PASS`.

## Regressions these guard

- `ListRefreshControl` must forward `children`: react-native-web's ScrollView renders itself inside
  the `refreshControl` element, so dropping children blanks the whole screen.
- Reanimated entering animations set `position: absolute` on web; screen cards must stay in flow.
- Tab routes must render content both via deep link and via the tab bar.

## Training (`e2e/mobile-training.e2e.mjs`)

`node e2e/mobile-training.e2e.mjs` drives the Program tab, the workout logger modal, recovery, the
history list and the program editor button by button. Extra regressions it guards:

- `@fastify/cors` v11 defaults `methods` to the CORS-safelisted set (`GET,HEAD,POST`), so every
  browser `PUT`/`DELETE` died in preflight — saving the program editor and deleting a log failed
  with nothing on screen. `apps/api/src/app.ts` now lists the methods explicitly.
- The logger's horizontal pager must lay each pane out exactly one screen wide and auto-advance to
  the next exercise once the last set of the current one is logged.
- Note for anyone writing more of these: the query cache is persisted to localStorage and hydrated
  synchronously with a 30 s `staleTime`, so a plain reload repaints the old data without hitting the
  network. Drop `fitfloow\query.cache.v1` first when a test needs a real request (see `coldBoot`).
