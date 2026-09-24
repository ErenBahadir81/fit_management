#!/usr/bin/env node
// Floo motion filmstrip — a motion quality gate for the mascot playground.
//
// For every clip (each trigger-*, gesture-* button and each mood-* transition from idle) it resets
// Floo to idle, lets it settle, clicks the button and samples the `floo-stage` element densely over
// the clip's span. Output: one contact sheet PNG per clip, an index.html with scrubbable players,
// report.json with simple pixel-diff metrics (teleports, returns-to-rest, motion-energy curve).
//
// See README.md next to this file for usage, the metric thresholds and the review rubric.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { launchBrowser, routeCanvasKit } from "./browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- thresholds (documented in README.md) --------------------------------------------------
const RATE_WINDOW = 40; // step changes are normalised to "fraction of character px changed per 40 ms"
const TELEPORT_ABS = 0.3; // a step must change ≥30 % of character px (per 40 ms) …
const TELEPORT_RATIO = 3; // … and be ≥3× both neighbouring steps (and the idle floor)
const REST_ABS = 0.06; // returns to rest if final frame is within 6 % of some idle frame …
const REST_IDLE_MULT = 1.5; // … or within 1.5× the idle loop's own spread, whichever is larger
const MOTION_ABS = 0.03; // a step counts as "moving" above 3 % per 40 ms …
const MOTION_IDLE_MULT = 2; // … or 2× the idle floor, whichever is larger
const REDUCED_PEAK = 0.25; // with reduced motion on, no step should exceed 25 % per 40 ms

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:8091/mascot-playground" },
    out: { type: "string", default: path.resolve(process.cwd(), "floo-filmstrip-out") },
    only: { type: "string" },
    frames: { type: "string", default: "8" },
    span: { type: "string" },
    tail: { type: "string", default: "1200" },
    step: { type: "string", default: "32" },
    settle: { type: "string", default: "1200" },
    idle: { type: "string", default: "2000" },
    lod: { type: "string" },
    clock: { type: "string", default: "virtual" }, // virtual | real
    sim: { type: "string", default: "exact" }, // exact (every 16 ms rAF) | fast (one rAF per step)
    scale: { type: "string", default: "2" },
    reduced: { type: "boolean", default: false },
    video: { type: "boolean", default: false },
    hmr: { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (args.help) {
  console.log(fs.readFileSync(path.join(HERE, "README.md"), "utf8").split("## Metrics")[0]);
  process.exit(0);
}

// --span accepts "1400" (all clips) or "1400,wave=2400,fallRecover=3200" (per-clip overrides).
const DEFAULT_SPAN = 1400;
const spanOverrides = {};
let spanDefault = DEFAULT_SPAN;
for (const part of (args.span || "").split(",").filter(Boolean)) {
  const [k, v] = part.includes("=") ? part.split("=") : [null, part];
  if (k) spanOverrides[k.trim()] = +v;
  else spanDefault = +v;
}
const spanFor = (clip) => spanOverrides[clip.id] ?? spanOverrides[clip.name] ?? spanDefault;

const N = Math.max(2, +args.frames);
// The fake clock fires rAF on 16 ms boundaries, so the sampling step is snapped to a multiple of 16.
const TAIL = +args.tail, STEP = Math.max(16, Math.round(+args.step / 16) * 16), SETTLE = +args.settle, IDLE = +args.idle;
const VIRTUAL = args.clock !== "real";
const OUT = path.resolve(args.out);
fs.mkdirSync(path.join(OUT, "sheets"), { recursive: true });
fs.mkdirSync(path.join(OUT, "sprites"), { recursive: true });

const log = (...a) => console.log(`[filmstrip ${new Date().toISOString().slice(11, 19)}]`, ...a);
const r3 = (x) => Math.round(x * 1000) / 1000;

// ---- browser setup --------------------------------------------------------------------------
const browser = await launchBrowser({ headless: !args.headed });
const ctxOpts = {
  viewport: { width: 520, height: 900 },
  deviceScaleFactor: +args.scale,
  reducedMotion: args.reduced ? "reduce" : "no-preference",
};
if (args.video) ctxOpts.recordVideo = { dir: path.join(OUT, ".video-tmp"), size: { width: 520, height: 900 } };
const ctx = await browser.newContext(ctxOpts);
const ckNote = await routeCanvasKit(ctx);
if (ckNote) log(ckNote);
const consoleErrors = [];
let pageErrorCount = 0; // uncaught page exceptions; the dev error overlay is not reliably in the DOM text
const videos = [];
// The Metro dev server hot-reloads the page when sources change. Another edit landing mid-run would
// swap the character between clips (or crash it), so by default the page's websockets are mocked
// and never reach the server; pass --hmr to allow live reloads.
if (!args.hmr) await ctx.routeWebSocket(/.*/, () => {});

const labCtx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const lab = await labCtx.newPage();
await lab.setContent("<!doctype html><title>lab</title>");
await lab.addScriptTag({ path: path.join(HERE, "lab.js") });

const tid = (id) => `[data-testid="${id}"]`;
let page, cdp, clockPaused;
const exists = async (id) => (await page.$(tid(id))) !== null;

/** Open (or re-open after a crash) the playground and put it in the state every clip starts from. */
async function openPage() {
  if (page) await page.close().catch(() => {});
  page = await ctx.newPage();
  cdp = null;
  clockPaused = false;
  if (page.video()) videos.push(page.video());
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => {
    pageErrorCount++;
    consoleErrors.push(String(e).slice(0, 300));
  });
  if (VIRTUAL) await page.clock.install();
  log(`loading ${args.url}`);
  await page.goto(args.url);
  await page.waitForSelector(tid("floo-stage"), { timeout: 180000 });
  await page.waitForSelector(tid("mood-idle"), { timeout: 60000 });
  // Tall viewport so every button is on screen and clicks never scroll the stage away.
  const contentH = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, ...[...document.querySelectorAll("div")].map((d) => d.scrollHeight))
  );
  await page.setViewportSize({ width: 520, height: Math.min(3200, Math.max(900, contentH + 40)) });
  await page.mouse.move(2, 2);
  if (args.lod) {
    if (await exists(`lod-${args.lod}`)) await page.click(tid(`lod-${args.lod}`));
    else log(`warning: lod-${args.lod} button not found — running at the default LOD`);
  }
  await setReduced(args.reduced);
}

/** Healthy = stage present and no React/LogBox error overlay. */
async function pageHealthy() {
  try {
    if (!(await exists("floo-stage")) || !(await exists("mood-idle"))) return false;
    return !(await page.evaluate(() => /Uncaught Error|Render Error|Cannot read properties of/.test(document.body.innerText)));
  } catch {
    return false;
  }
}

/**
 * Raw mouse click at the element's centre. page.click()'s actionability checks wait for two
 * animation frames, which costs seconds on a software-rendered canvas and smears the click time.
 */
async function press(id) {
  const box = await page.locator(tid(id)).boundingBox();
  if (!box) throw new Error(`${id} not visible`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(2, 2);
}

async function setReduced(on) {
  const sw = await page.$(tid("reduced-motion"));
  if (!sw) return log("warning: reduced-motion switch not found");
  const state = await sw.evaluate((el) => {
    const input = el.matches("input") ? el : el.querySelector("input[type=checkbox],[role=switch]");
    if (input && "checked" in input) return input.checked;
    return (input || el).getAttribute("aria-checked") === "true";
  });
  if (state !== on) await sw.click();
}
await openPage();

// ---- clip discovery -------------------------------------------------------------------------
const ids = await page.$$eval("[data-testid]", (els) => els.map((e) => e.dataset.testid));
const pick = (prefix) => ids.filter((i) => i.startsWith(prefix));
let clips = [
  ...pick("trigger-").map((id) => ({ id, kind: "trigger" })),
  ...pick("gesture-").map((id) => ({ id, kind: "gesture" })),
  ...pick("mood-").filter((i) => i !== "mood-idle").map((id) => ({ id, kind: "mood" })),
].map((c) => ({ ...c, name: c.id.slice(c.id.indexOf("-") + 1) }));
clips = clips.filter((c, i) => clips.findIndex((d) => d.id === c.id) === i);
if (args.only) {
  const want = args.only.split(",").map((s) => s.trim()).filter(Boolean);
  clips = clips.filter((c) => want.includes(c.id) || want.includes(c.name));
}
log(`clips (${clips.length}): ${clips.map((c) => c.id).join(" ")}`);
if (!clips.length) throw new Error("no clips matched");

// ---- time control ---------------------------------------------------------------------------
async function pauseClock() {
  if (clockPaused) return;
  // pauseAt refuses targets in the (fake) past; the page clock can run slightly ahead of ours.
  let lastErr;
  for (const margin of [200, 1000, 5000]) {
    try {
      const now = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(now + margin);
      clockPaused = true;
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
/** Advance page time. exact: run every due rAF (60 fps sim); fast: one jump + one frame. */
async function advance(ms, exact = args.sim !== "fast") {
  if (ms <= 0) return;
  if (exact) return page.clock.runFor(Math.round(ms));
  if (ms > 17) await page.clock.fastForward(Math.round(ms - 17));
  await page.clock.runFor(17);
}
/** Coarse wait used for settling: big jumps, then a few exact frames so springs land cleanly. */
async function settle(ms) {
  if (!VIRTUAL) return page.waitForTimeout(ms);
  let left = ms - 100;
  while (left > 0) {
    await advance(Math.min(100, left), false);
    left -= 100;
  }
  await advance(100, true);
}

let stageBox;
async function measureStage() {
  stageBox = await page.locator(tid("floo-stage")).boundingBox();
}
async function grab(labId) {
  const buf = await page.screenshot({ clip: stageBox, type: "png" });
  return lab.evaluate(([id, u]) => window.LAB.add(id, u), [labId, "data:image/png;base64," + buf.toString("base64")]);
}
const diff = (a, b) => lab.evaluate(([x, y]) => window.LAB.diff(x, y), [a, b]);
/** Displacement-tolerant diff: ignores changes explained by a ≤1 metric-px shift (breathing, bob). */
const tdiff = (a, b) => lab.evaluate(([x, y]) => window.LAB.diff(x, y, 1), [a, b]);

// ---- real-time capture (CDP screencast) -----------------------------------------------------
async function screencast(runFn) {
  cdp ??= await ctx.newCDPSession(page);
  const got = [];
  const onFrame = (f) => {
    got.push({ ts: f.metadata.timestamp * 1000, data: f.data, meta: f.metadata });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  const marks = await runFn();
  await cdp.send("Page.stopScreencast");
  cdp.off("Page.screencastFrame", onFrame);
  return { got, marks };
}

/** The playground prints its state as JSON in `state-readout`; use it to see if a trigger switched mood. */
async function readMood() {
  try {
    const txt = await page.textContent(tid("state-readout"), { timeout: 1000 });
    return JSON.parse(txt).mood ?? null;
  } catch {
    return null;
  }
}

// ---- per-clip capture -----------------------------------------------------------------------
async function resetToIdle() {
  await press("mood-idle");
  await settle(SETTLE);
}

async function captureVirtual(clip, span) {
  await pauseClock();
  await resetToIdle();
  await measureStage();
  const P = clip.id + "/";
  // idle reference loop
  const idle = [];
  const idleStep = 100;
  for (let t = 0; t <= IDLE; t += idleStep) {
    if (t) await advance(idleStep, false); // idle is slow; one frame per step is plenty
    await grab(P + "idle" + t);
    idle.push({ id: P + "idle" + t, t: t - IDLE });
  }
  // the click happens at virtual t = 0 (the last idle frame is the pre-click frame)
  await press(clip.id);
  const targets = Array.from({ length: N }, (_, k) => Math.round((span * (k + 1)) / N));
  // Uniform grid only: inserting the sheet's target times would create tiny, uneven steps whose
  // normalised change rate is meaningless. The sheet picks the nearest grid frame instead.
  const times = [];
  for (let t = STEP; t < span + STEP / 2; t += STEP) times.push(t);
  const dense = [];
  let now = 0;
  for (const t of times) {
    await advance(t - now);
    now = t;
    await grab(P + "f" + t);
    dense.push({ id: P + "f" + t, t });
  }
  await settle(TAIL);
  await grab(P + "rest");
  const rest = { id: P + "rest", t: span + TAIL };
  return { idle, dense, rest, targets, moodAfter: await readMood() };
}

async function captureReal(clip, span) {
  await resetToIdle();
  await measureStage();
  const vp = page.viewportSize();
  const { got, marks } = await screencast(async () => {
    await page.waitForTimeout(IDLE);
    const t0 = Date.now();
    await press(clip.id);
    const t1 = Date.now();
    await page.waitForTimeout(span + TAIL);
    return { t0, t1 };
  });
  const P = clip.id + "/";
  const click = (marks.t0 + marks.t1) / 2;
  const add = async (f, id) => {
    const imgW = await lab.evaluate((u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i.width); i.src = u; }), "data:image/png;base64," + f.data);
    const k = imgW / (f.meta.deviceWidth || vp.width); // metadata is CSS px; the image may be device px
    const crop = { x: stageBox.x * k, y: (stageBox.y - (f.meta.offsetTop || 0)) * k, w: stageBox.width * k, h: stageBox.height * k };
    await lab.evaluate(([i, u, c]) => window.LAB.add(i, u, c), [id, "data:image/png;base64," + f.data, crop]);
  };
  const idle = [], dense = [];
  for (const f of got) {
    const t = Math.round(f.ts - click);
    if (t < 0) {
      await add(f, P + "idle" + idle.length);
      idle.push({ id: P + "idle" + idle.length, t });
    } else if (t <= span) {
      await add(f, P + "f" + dense.length);
      dense.push({ id: P + "f" + dense.length, t });
    }
  }
  const last = got[got.length - 1];
  await add(last, P + "rest");
  const rest = { id: P + "rest", t: Math.round(last.ts - click) };
  const targets = Array.from({ length: N }, (_, k) => Math.round((span * (k + 1)) / N));
  return { idle, dense, rest, targets, clickLatencyMs: marks.t1 - marks.t0, moodAfter: await readMood() };
}

// ---- metrics --------------------------------------------------------------------------------
async function analyse(clip, cap, span) {
  const { idle, dense, rest } = cap;
  if (!dense.length) throw new Error(`${clip.id}: no frames captured inside the span`);
  // idle floor: per-step change rate and overall spread of the idle loop
  const idleRates = [];
  for (let i = 1; i < idle.length; i++) {
    const d = await diff(idle[i - 1].id, idle[i].id);
    idleRates.push((d.frac / Math.max(1, idle[i].t - idle[i - 1].t)) * RATE_WINDOW);
  }
  // Idle is not still: it breathes, blinks and plays occasional fidget gestures. Use medians so a
  // fidget that happens to land in the idle window does not inflate every threshold.
  const pair = [];
  for (let i = 0; i < idle.length; i++)
    for (let j = i + 1; j < idle.length; j++) pair.push((await tdiff(idle[i].id, idle[j].id)).frac);
  const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0);
  const idleSpread = med(pair), idleSpreadMax = pair.length ? Math.max(...pair) : 0;
  const idleFloor = med(idleRates), idleFloorMax = idleRates.length ? Math.max(...idleRates) : 0;
  const moveTol = Math.max(MOTION_ABS, MOTION_IDLE_MULT * idleFloor);
  const restTol = Math.max(REST_ABS, REST_IDLE_MULT * idleSpread);

  // energy curve: pre-click frame → each dense frame in turn
  const pre = idle[idle.length - 1];
  const seq = [pre, ...dense];
  const energy = [];
  for (let i = 1; i < seq.length; i++) {
    const d = await diff(seq[i - 1].id, seq[i].id);
    const dt = Math.max(1, seq[i].t - seq[i - 1].t);
    energy.push({ t: seq[i].t, dt, frac: r3(d.frac), rate: r3((d.frac / dt) * RATE_WINDOW) });
  }
  const rates = energy.map((e) => e.rate);
  const teleports = [];
  rates.forEach((r, i) => {
    const prev = i > 0 ? rates[i - 1] : idleFloor;
    const next = i < rates.length - 1 ? rates[i + 1] : 0;
    if (r >= TELEPORT_ABS && r >= TELEPORT_RATIO * Math.max(prev, next, idleFloor, 0.01))
      teleports.push({ t: energy[i].t, rate: r, prev: r3(prev), next: r3(next) });
  });
  const maxStep = energy.reduce((m, e) => (e.rate > m.rate ? e : m), energy[0]);
  const onset = energy.find((e) => e.rate > moveTol);
  const lastMoving = [...energy].reverse().find((e) => e.rate > moveTol);

  const distToIdle = async (id) => {
    let best = Infinity;
    for (const f of idle) best = Math.min(best, (await tdiff(id, f.id)).frac);
    return r3(best);
  };
  const restDiff = await distToIdle(rest.id);
  const spanEndDiff = await distToIdle(dense[dense.length - 1].id);
  const tail = energy.slice(-2);
  const stillMovingAtSpanEnd = tail.some((e) => e.rate > moveTol);

  const flags = [];
  const notes = [];
  if (teleports.length) flags.push(`teleport@${teleports.map((t) => t.t + "ms").join(",")}`);
  if (!onset) flags.push("no-visible-response");
  const moodSwitched = clip.kind !== "mood" && cap.moodAfter && cap.moodAfter !== "idle";
  if (clip.kind !== "mood" && restDiff > restTol) {
    // A trigger that deliberately hands over to another mood (goalHit → celebrate) is not "stuck".
    if (moodSwitched) notes.push(`switches mood to "${cap.moodAfter}" — rest check compares against idle, so not applicable`);
    else flags.push("does-not-return-to-rest");
  }
  if (clip.kind === "mood" && restDiff <= restTol) flags.push("mood-indistinguishable-from-idle");
  if (args.reduced && maxStep.rate > REDUCED_PEAK) flags.push(`reduced-motion-large-step@${maxStep.t}ms`);
  if (stillMovingAtSpanEnd) notes.push("still moving at end of span (consider a longer --span for this clip)");
  if (onset && onset.t > 150) notes.push(`first visible reaction only at ${onset.t}ms`);

  return {
    idleFloorRate: r3(idleFloor),
    idleFloorRateMax: r3(idleFloorMax),
    idleSpread: r3(idleSpread),
    idleSpreadMax: r3(idleSpreadMax),
    thresholds: { move: r3(moveTol), rest: r3(restTol) },
    maxStep: { t: maxStep.t, rate: maxStep.rate },
    teleports,
    moodAfter: cap.moodAfter ?? null,
    onsetMs: onset ? onset.t : null,
    lastMovingMs: lastMoving ? lastMoving.t : null,
    stillMovingAtSpanEnd,
    returnsToRest: { restFrameMs: rest.t, diffToIdle: restDiff, atRest: restDiff <= restTol, spanEndDiffToIdle: spanEndDiff, atRestBySpanEnd: spanEndDiff <= restTol },
    energy,
    flags,
    notes,
  };
}

async function renderSheet(clip, cap, metrics, span) {
  const { idle, dense, rest, targets } = cap;
  const pre = idle[idle.length - 1];
  const nearest = (t) => dense.reduce((b, f) => (Math.abs(f.t - t) < Math.abs(b.t - t) ? f : b), dense[0]);
  const picked = targets.map(nearest);
  const tiles = [pre, ...picked, rest];
  const labels = ["idle", ...picked.map((f) => `${f.t}ms`), `rest ${rest.t}ms`];
  const telT = new Set(metrics.teleports.map((t) => t.t));
  const flags = tiles.map((f, k) => k > 0 && k <= picked.length && [...telT].some((t) => t > (k > 1 ? picked[k - 2].t : 0) && t <= f.t));
  const title = `${clip.id}   span ${span}ms   ${metrics.flags.length ? "⚑ " + metrics.flags.join("  ") : "ok"}`;
  const sheetUrl = await lab.evaluate(([a, b, c, d]) => window.LAB.sheet(a, b, c, 200, d), [tiles.map((f) => f.id), labels, title, flags]);
  const sheetFile = `sheets/${clip.id}.png`;
  fs.writeFileSync(path.join(OUT, sheetFile), Buffer.from(sheetUrl.split(",")[1], "base64"));
  const all = [pre, ...dense, rest];
  const sp = await lab.evaluate(([a]) => window.LAB.sprite(a, 240), [all.map((f) => f.id)]);
  const spriteFile = `sprites/${clip.id}.jpg`;
  fs.writeFileSync(path.join(OUT, spriteFile), Buffer.from(sp.url.split(",")[1], "base64"));
  return { sheet: sheetFile, sprite: { file: spriteFile, tileW: sp.tw, tileH: sp.th, times: all.map((f) => f.t) }, sheetTimes: tiles.map((f) => f.t) };
}

// ---- run ------------------------------------------------------------------------------------
const report = {
  generatedAt: new Date().toISOString(),
  url: args.url,
  options: { frames: N, spanDefault, spanOverrides, tail: TAIL, step: STEP, settle: SETTLE, idle: IDLE, clock: VIRTUAL ? "virtual" : "real", sim: args.sim, scale: +args.scale, reduced: args.reduced, lod: args.lod ?? null },
  thresholds: { RATE_WINDOW, TELEPORT_ABS, TELEPORT_RATIO, REST_ABS, REST_IDLE_MULT, MOTION_ABS, MOTION_IDLE_MULT, REDUCED_PEAK, ...(await lab.evaluate(() => window.LAB.consts)) },
  clips: [],
};
const t0 = Date.now();
for (const clip of clips) {
  const span = spanFor(clip);
  const started = Date.now();
  try {
    if (pageErrorCount || !(await pageHealthy())) {
      log("page unhealthy (uncaught error, crash or error overlay) — reopening");
      await openPage();
      pageErrorCount = 0;
    }
    const cap = VIRTUAL ? await captureVirtual(clip, span) : await captureReal(clip, span);
    if (pageErrorCount || !(await pageHealthy()))
      throw new Error(`uncaught page error during the clip: ${consoleErrors[consoleErrors.length - 1] ?? "page crashed or showed an error overlay"}`);
    const metrics = await analyse(clip, cap, span);
    const files = await renderSheet(clip, cap, metrics, span);
    report.clips.push({
      id: clip.id, kind: clip.kind, name: clip.name, span,
      frameTimesMs: cap.dense.map((f) => f.t), sheetFrameTimesMs: files.sheetTimes,
      ...(cap.clickLatencyMs != null ? { clickLatencyMs: cap.clickLatencyMs } : {}),
      ...metrics, files,
    });
    log(`${clip.id.padEnd(28)} ${String(Date.now() - started).padStart(6)}ms wall  maxStep ${metrics.maxStep.rate.toFixed(3)}@${metrics.maxStep.t}  rest ${metrics.returnsToRest.diffToIdle.toFixed(3)}  ${metrics.flags.join(" ") || "ok"}`);
  } catch (e) {
    log(`${clip.id}: FAILED ${e.message}`);
    report.clips.push({ id: clip.id, kind: clip.kind, name: clip.name, span, error: String(e.message || e) });
  }
  await lab.evaluate((p) => window.LAB.drop(p), clip.id + "/");
}
report.wallMs = Date.now() - t0;
report.consoleErrors = [...new Set(consoleErrors)].slice(0, 50);
report.summary = {
  clips: report.clips.length,
  flagged: report.clips.filter((c) => c.flags?.length || c.error).map((c) => ({ id: c.id, flags: c.flags ?? ["error"] })),
};
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(OUT, "index.html"), renderIndex(report));

if (VIRTUAL && clockPaused) await page.clock.resume().catch(() => {});
await ctx.close();
for (const [k, video] of videos.entries()) {
  const dest = path.join(OUT, k ? `run-${k + 1}.webm` : "run.webm");
  fs.renameSync(await video.path(), dest);
  log(`video: ${dest}${VIRTUAL ? " (virtual clock: plays in slow motion)" : ""}`);
}
if (videos.length) fs.rmSync(path.join(OUT, ".video-tmp"), { recursive: true, force: true });
await browser.close();
log(`done in ${Math.round(report.wallMs / 1000)}s → ${path.join(OUT, "index.html")}`);
log(`flagged: ${report.summary.flagged.length ? report.summary.flagged.map((f) => `${f.id} [${f.flags.join(", ")}]`).join("; ") : "none"}`);

// ---- index.html -----------------------------------------------------------------------------
function renderIndex(rep) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const spark = (c) => {
    const W = 300, H = 60, maxT = c.span, maxR = Math.max(0.35, ...c.energy.map((e) => e.rate));
    const pts = c.energy.map((e) => `${((e.t / maxT) * W).toFixed(1)},${(H - (e.rate / maxR) * H).toFixed(1)}`).join(" ");
    const tel = c.teleports.map((t) => `<line x1="${(t.t / maxT) * W}" x2="${(t.t / maxT) * W}" y1="0" y2="${H}" class="tel"/>`).join("");
    const floorY = H - (c.thresholds.move / maxR) * H;
    return `<svg viewBox="0 0 ${W} ${H}" class="spark" role="img" aria-label="motion energy"><line x1="0" x2="${W}" y1="${floorY}" y2="${floorY}" class="floor"/>${tel}<polyline points="${pts}"/></svg>`;
  };
  const cards = rep.clips
    .map((c) => {
      if (c.error) return `<section class="clip err" id="${esc(c.id)}"><h2>${esc(c.id)}</h2><p>error: ${esc(c.error)}</p></section>`;
      const status = c.flags.length ? `<span class="bad">${c.flags.map(esc).join(" · ")}</span>` : `<span class="ok">ok</span>`;
      return `<section class="clip" id="${esc(c.id)}">
  <header><h2>${esc(c.id)}</h2><span class="kind">${c.kind}</span>${status}</header>
  <div class="row">
    <div class="player" data-sprite="${esc(c.files.sprite.file)}" data-w="${c.files.sprite.tileW}" data-h="${c.files.sprite.tileH}" data-times="${c.files.sprite.times.join(",")}">
      <div class="view" style="width:${c.files.sprite.tileW}px;height:${c.files.sprite.tileH}px;background-image:url('${esc(c.files.sprite.file)}')"></div>
      <div class="ctl"><button class="pp" type="button">pause</button><input type="range" min="0" max="${c.files.sprite.times.length - 1}" value="0"><output>0ms</output></div>
    </div>
    <div class="facts">
      ${spark(c)}
      <dl>
        <dt>max step</dt><dd>${c.maxStep.rate.toFixed(3)} @ ${c.maxStep.t}ms</dd>
        <dt>onset / last moving</dt><dd>${c.onsetMs ?? "—"} / ${c.lastMovingMs ?? "—"} ms</dd>
        <dt>rest diff (${c.returnsToRest.restFrameMs}ms)</dt><dd>${c.returnsToRest.diffToIdle.toFixed(3)} (tol ${c.thresholds.rest.toFixed(3)}) ${c.returnsToRest.atRest ? "at rest" : "NOT at rest"}</dd>
        <dt>idle floor / spread</dt><dd>${c.idleFloorRate.toFixed(3)} / ${c.idleSpread.toFixed(3)}</dd>
      </dl>
      ${c.notes.length ? `<p class="notes">${c.notes.map(esc).join("<br>")}</p>` : ""}
    </div>
  </div>
  <img class="sheet" loading="lazy" src="${esc(c.files.sheet)}" alt="${esc(c.id)} contact sheet">
</section>`;
    })
    .join("\n");
  const o = rep.options;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Floo filmstrip</title>
<style>
:root{--bg:#f6f6f4;--fg:#1d1f24;--muted:#6a6f7a;--card:#fff;--line:#e2e2de;--bad:#c62828;--ok:#2e7d32;--accent:#2b6cb0}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#e8e9ec;--muted:#9aa0aa;--card:#1b1e23;--line:#2c3038;--bad:#ff7b7b;--ok:#7fd48a;--accent:#7fb2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;padding:16px}
h1{font-size:20px;margin:0 0 4px}.meta{color:var(--muted);margin:0 0 12px}
.summary{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:16px}
.summary a{color:var(--accent)}
.clip{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:0 0 16px}
.clip header{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.clip h2{font-size:16px;margin:0}
.kind{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em}.bad{color:var(--bad);font-weight:600}.ok{color:var(--ok);font-weight:600}
.row{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0}
.view{background-repeat:no-repeat;border-radius:8px;max-width:100%}
.ctl{display:flex;gap:8px;align-items:center;margin-top:6px}.ctl input{flex:1}.ctl output{font:12px ui-monospace,monospace;min-width:64px}
.facts{flex:1;min-width:260px}.facts dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:8px 0}.facts dt{color:var(--muted)}.facts dd{margin:0;font-variant-numeric:tabular-nums}
.spark{width:100%;max-width:420px;height:70px;background:var(--bg);border-radius:6px}.spark polyline{fill:none;stroke:var(--accent);stroke-width:1.6}.spark .floor{stroke:var(--muted);stroke-dasharray:3 3}.spark .tel{stroke:var(--bad);stroke-width:2}
.notes{color:var(--muted);margin:4px 0 0}
.sheet{display:block;max-width:100%;overflow-x:auto;border-radius:6px}
.speed{margin-left:8px}
</style></head><body>
<h1>Floo filmstrip</h1>
<p class="meta">${esc(rep.url)} · ${esc(rep.generatedAt)} · clock ${o.clock}/${o.sim} · step ${o.step}ms · span ${o.spanDefault}ms (+${o.tail}ms tail) · reduced motion ${o.reduced ? "ON" : "off"}${o.lod ? " · lod " + esc(o.lod) : ""}
<label class="speed">playback <select id="speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option></select></label></p>
<div class="summary"><strong>${rep.summary.flagged.length} of ${rep.summary.clips} clips flagged.</strong> ${rep.summary.flagged.map((f) => `<a href="#${esc(f.id)}">${esc(f.id)}</a> (${f.flags.map(esc).join(", ")})`).join(" · ")}
<br><span class="meta">Energy graph: fraction of character pixels changed per ${rep.thresholds.RATE_WINDOW} ms; dashed = "moving" threshold; red = teleport. Player steps through every captured frame at its recorded time.</span></div>
${cards}
<script>
const speedSel=document.getElementById('speed');let speed=+speedSel.value;speedSel.onchange=()=>speed=+speedSel.value;
for(const p of document.querySelectorAll('.player')){
  const times=p.dataset.times.split(',').map(Number),w=+p.dataset.w,view=p.querySelector('.view'),range=p.querySelector('input'),out=p.querySelector('output'),btn=p.querySelector('.pp');
  let i=0,playing=true,acc=0,last=performance.now();
  const show=k=>{i=k;view.style.backgroundPosition=(-k*w)+'px 0';range.value=k;out.textContent=times[k]+'ms';};
  range.oninput=()=>{playing=false;btn.textContent='play';show(+range.value)};
  btn.onclick=()=>{playing=!playing;btn.textContent=playing?'pause':'play';last=performance.now()};
  const hold=(k)=>k===0||k===times.length-1?600:Math.max(16,times[k+1]-times[k]);
  const tick=now=>{if(playing){acc+=(now-last)*speed;while(acc>=hold(i)){acc-=hold(i);show((i+1)%times.length)}}last=now;requestAnimationFrame(tick)};
  show(0);requestAnimationFrame(tick);
}
</script></body></html>`;
}
