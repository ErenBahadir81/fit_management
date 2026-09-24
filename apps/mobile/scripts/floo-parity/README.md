# Floo parity loop

Renders the idle Floo from the running playground (`expo start --web --port 3000`) and scores it
against the reference illustration pixel-by-pixel (pixelmatch), region by region.

```sh
npm i --prefix /tmp/floo-tools pixelmatch pngjs   # once; playwright resolves from the repo root
node render.mjs /tmp/floo/ours.png
node compare.mjs /tmp/floo/ours.png /tmp/floo/out   # → sbs.png (ref | ours | diff), scores.json
```

Body space ↔ reference mapping: base circle centre (100,158) r 62 ⇔ reference px (1416,790) r 328.
Target: overall ≥ 97, every region ≥ 95.
