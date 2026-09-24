# Floo filmstrip — motion quality gate

Samples every Floo clip in the mascot playground frame by frame and produces:

- `sheets/<clip>.png`: a contact sheet showing the pre-click idle frame, N frames spread evenly over the span, and a final "rest" frame. Each frame is labelled with its ms.
- `sprites/<clip>.jpg` + `index.html`: one page with every sheet, a looping player per clip (it steps through **every** captured frame at its recorded time, with a scrubber and 0.25×/0.5×/1× speed), and a motion-energy sparkline.
- `report.json`: per-clip frame timestamps and the automatic metrics described below.
- `run.webm` (with `--video`): a Playwright recording of the whole run for a human to watch.

The script finds clips at runtime. Each `trigger-*` and `gesture-*` button is one clip, and so is each `mood-*` button (as a transition from idle). New buttons are picked up without code changes.

## Usage

```sh
# from apps/mobile, with the web target running (npx expo start --web --port 8091)
node scripts/floo-filmstrip/filmstrip.mjs --out /tmp/floo-film
open /tmp/floo-film/index.html
```

| flag | default | meaning |
|---|---|---|
| `--url` | `http://localhost:8091/mascot-playground` | playground URL |
| `--out` | `./floo-filmstrip-out` | output directory |
| `--only` | all | comma list of clip ids or names: `goalHit,gesture-wave,happy` |
| `--frames` | `8` | frames per contact sheet (idle and rest frames are added on top) |
| `--span` | `1400` | ms sampled after the click. Per-clip override: `--span 1400,fallRecover=3200,walk=2400` |
| `--tail` | `1200` | extra settle time before the final "rest" frame (so the rest frame lands at span + tail) |
| `--step` | `32` | dense sampling step in ms. It is snapped to a multiple of 16 because the fake clock fires rAF every 16 ms |
| `--settle` | `1200` | settle time after resetting to `mood-idle` |
| `--idle` | `2000` | length of the idle reference loop recorded before each click (sampled every 100 ms) |
| `--lod` | none | clicks `lod-<full\|mid\|badge>` first, if that button exists |
| `--clock` | `virtual` | `virtual` = deterministic Playwright fake clock (recommended). `real` = CDP screencast in wall-clock time |
| `--sim` | `exact` | virtual clock only. `exact` runs every 16 ms rAF (60 fps simulation). `fast` jumps one step at a time with one frame per step: about 2× faster, but it distorts springs |
| `--scale` | `2` | deviceScaleFactor |
| `--reduced` | off | turns on the `reduced-motion` switch and emulates `prefers-reduced-motion: reduce` |
| `--video` | off | also records `run.webm` (plus `run-2.webm`, … if the page was reopened after a crash) |
| `--hmr` | off | allow Metro hot reload. By default the page's websockets are mocked, so edits landing mid-run cannot swap or crash the character between clips. |
| `--headed` | off | shows the browser |

### Why a virtual clock

In a CPU-only container, Skia renders at about 10 fps and a screenshot takes 0.7–1.1 s, so wall-clock capture would give jittery, undersampled frames. The virtual mode installs Playwright's fake clock and pauses it. For each sample it advances page time (`requestAnimationFrame`, `performance.now` and timers are all faked) and then screenshots the stage while time is frozen. Reanimated reads the faked rAF timestamps, so each frame shows the pose at exactly that ms, however slow the machine is. Timestamps in the report are page ms after the click. In this mode `run.webm` plays in slow motion.

`--clock real` records a CDP screencast and measures real timestamps. It is only useful on a machine that renders at full rate. In the sandbox, input alone lagged by 1.3–1.8 s (reported as `clickLatencyMs`) and frames arrived every 200–400 ms.

The script also serves `canvaskit.wasm` from `node_modules/canvaskit-wasm` (see `browser.mjs`) instead of jsDelivr, so Skia boots offline and behind TLS-intercepting proxies.

Before each clip the script checks that the page is healthy: `floo-stage` and `mood-idle` exist and no uncaught page error has fired and no LogBox "Uncaught Error"/"Render Error" overlay is showing. If the check fails it reopens the page. A clip that crashes the page is recorded with an `error` instead of bogus metrics, and page errors are collected in `report.json → consoleErrors`.

Runtime is roughly 40–60 s per clip with `--sim exact`. Use `--only` while iterating on one clip.

## Metrics

All metrics are pixel diffs of the `floo-stage` screenshot, downscaled to 320 px wide, with 6 % of each edge ignored because of the rounded corners.

- **Character pixel**: a pixel whose colour differs from the stage background by more than 40 (sum of |ΔRGB|, 0–765). The background is the median colour of a column just inside the left edge. Effects (confetti, hearts) count as character pixels.
- **Step change**: the fraction of character pixels (the union of both frames' masks) that changed by more than 48 between consecutive frames. It is normalised to a **rate per 40 ms** so that steps of different lengths are comparable. The step from the pre-click frame to the first frame is included.
- **Idle floor**: the *median* step rate while idling (breathing, blinking, sway) before the click. The median is used because idle also plays occasional fidget gestures, and one fidget in the window would inflate a max. The max is reported as `idleFloorRateMax`.
- **Idle spread**: the *median* shift-tolerant diff between pairs of idle frames (the max is reported as `idleSpreadMax`). The shift-tolerant diff ignores a pixel if a pixel within 1 metric px (about 1.5 CSS px) in the other frame matches it, in both directions.

| check | rule | flag |
|---|---|---|
| teleport | a step rate ≥ **0.30** that is also ≥ **3×** the larger of its two neighbouring steps and the idle floor | `teleport@<ms>` (red frame on the sheet, red line on the graph) |
| returns to rest | the shift-tolerant diff between the final frame (span + tail) and the *closest* idle frame is ≤ max(**0.06**, **1.5 ×** idle spread) | triggers/gestures: `does-not-return-to-rest`. If `state-readout` shows that the trigger switched mood (for example goalHit → celebrate), this becomes a note instead |
| visible response | some step exceeds the "moving" threshold, max(**0.03**, **2 ×** idle floor) | `no-visible-response` |
| mood is distinct | for mood clips, the final frame must *not* pass the rest test | `mood-indistinguishable-from-idle` |
| reduced motion | with `--reduced`, no step rate may exceed **0.25** | `reduced-motion-large-step@<ms>` |

The report also includes these, without flagging them: `onsetMs` (the first moving step; a note if it is later than 150 ms), `lastMovingMs`, `stillMovingAtSpanEnd` (a hint to lengthen `--span`), `atRestBySpanEnd`, and the full `energy` curve (`t`, `dt`, `frac`, `rate`).

Limitations: pixel diffs measure *how much* changed, not *how* it changed. Legitimate fast whips can come close to the teleport threshold, so check any flag in the player before acting on it. A rest check against a fast or large idle loop is loose, because the tolerance grows with the idle spread; read the spread next to the diff. The metrics can't judge easing, arcs or appeal. Those are for the rubric below.

## Review rubric

This rubric is adapted from `.claude/skills/design-motion-principles` (SKILL.md, `references/audit-checklist.md`, `references/anti-checklist.md`). It keeps the checks that apply to a character rather than to UI chrome. Judge every clip in the player at 1× and 0.25×.

1. **No linear motion.** Nothing should move at constant speed. In the energy graph, a flat plateau that starts and stops abruptly means linear tweening. Look for ease-out on arrivals and springs on body parts ("things slow down before stopping in real life"; custom curves, not default easing).
2. **No metronome symmetry.** Idle and looping gestures (wave, walk, clap) should not repeat with identical timing and amplitude on both sides. Look for offset overlap between the arms, the body and the face, and slight variation from beat to beat. A perfectly periodic energy curve with identical peaks is a warning sign. This is the character version of the anti-checklist's "same animation everywhere" and "uniform timing" slop patterns.
3. **Anticipation and follow-through.** Big actions (jump, fistPump, splash, fallRecover) should show a counter-move in the first 100–200 ms: a squash, a dip or a wind-up. They should also overshoot and settle, with appendages dragging behind the body. The first sheet frames should not already be at the pose's extreme.
4. **No teleports.** No part (a limb, a pupil, an accessory) should appear or disappear between frames, and expressions should not snap between two poses without in-betweens, except for deliberate holds such as a blink. Any `teleport@` flag must be justified or fixed.
5. **Returns to rest.** Every trigger or gesture should end in the idle pose (or hand over to an explicit new mood) with no residual offset, frozen limb or stuck expression. The "rest" tile should look like the "idle" tile. `does-not-return-to-rest` blocks the gate.
6. **Reduced-motion path.** Run with `--reduced`. Gestures and effects should collapse to short (~150 ms) cross-fades or pose changes, without travel, bounce, spin, confetti or large scale changes, and without vestibular triggers (big zoom, spin). The character must still communicate the reaction; don't remove it entirely.
7. **Duration and purpose.** Frequent reactions (tap, waterLogged, setCompleted) should be short and quiet. Rare celebrations (goalHit, workoutDone, streakUp) may be long and expressive. Check that every clip is interruptible: firing another trigger mid-clip must not snap.
8. **Anything the metrics miss.** Look for arcs rather than straight-line paths, volume preservation under squash and stretch, secondary motion (droplet tip, cheeks), gaze leading the head, and no sliding feet on walk.

A clip passes when it has no flags (or its flags are explained) and none of rubric items 1–6 fails.
