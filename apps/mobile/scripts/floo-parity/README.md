# Floo parity loop

Renders the idle Floo from the running playground and scores it against the reference
illustration pixel by pixel (pixelmatch), region by region.

```sh
# once: pixelmatch + pngjs are not repo deps; install them anywhere and point FLOO_TOOLS at it
npm i --prefix /tmp/floo-tools pixelmatch pngjs        # FLOO_TOOLS defaults to /tmp/floo-tools

# playground running, e.g. `npx expo start --web --port 8091` from apps/mobile
node render.mjs /tmp/floo/ours.png [--url http://localhost:8091/mascot-playground]
node compare.mjs /tmp/floo/ours.png /tmp/floo/out [reference.jpg]   # → sbs.png (ref | ours | diff), scores.json
```

- `render.mjs` URL: `--url`, else `$FLOO_URL`, else `http://localhost:8091/mascot-playground`.
- `compare.mjs` reference: 3rd argument, else `$FLOO_REF`, else the repo-root
  `Gemini_Generated_Image_pgiob1pgiob1pgio.jpg` (resolved relative to this script, so it works from any cwd).
- Both scripts use `../floo-filmstrip/browser.mjs` to launch Chromium (falls back to a browser
  under `$PLAYWRIGHT_BROWSERS_PATH` / `/opt/pw-browsers` when Playwright's pinned build isn't installed)
  and `render.mjs` serves `canvaskit.wasm` from `node_modules/canvaskit-wasm` instead of jsDelivr,
  so Skia boots behind TLS-intercepting proxies and offline.

Body space ↔ reference mapping: base circle centre (100,158) r 62 ⇔ reference px (1416,790) r 328.
Target: overall ≥ 97, every region ≥ 95.
