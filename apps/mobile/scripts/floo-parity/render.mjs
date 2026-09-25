// Usage: node render.mjs <out.png> [--url http://localhost:8091/mascot-playground]
//   (or FLOO_URL=...) — screenshots the playground canvas (idle mood, hydration 100, no pointer)
import { parseArgs } from "node:util";
import { launchBrowser, routeCanvasKit } from "../floo-filmstrip/browser.mjs";
const { values, positionals } = parseArgs({ allowPositionals: true, options: { url: { type: "string" } } });
const out = positionals[0];
if (!out) { console.error("usage: node render.mjs <out.png> [--url <playground url>]"); process.exit(2); }
const url = values.url || process.env.FLOO_URL || "http://localhost:8091/mascot-playground";
const b = await launchBrowser(); const ctx = await b.newContext({ viewport: { width: 520, height: 900 }, reducedMotion: "reduce", deviceScaleFactor: 3 });
await routeCanvasKit(ctx); const p = await ctx.newPage();
const errs = []; p.on("console", m => m.type() === "error" && errs.push(m.text()));
await p.goto(url); await p.waitForSelector('[data-testid="mood-happy"]', { timeout: 60000 });
await p.click('[data-testid="mood-idle"]'); await p.click('[data-testid="hydration-100"]'); await p.mouse.move(5, 5);
await p.evaluate(() => { const el = document.querySelector('[data-testid="floo-stage"]'); if (el) { el.style.backgroundColor = "#A0BAC7"; el.style.borderColor = "#A0BAC7"; } });
await p.waitForTimeout(2200);
// The model's own canvas (the effect layers are canvases too), shot as an element: clicking the
// hydration chip scrolls the page, so a page-coordinate clip can land outside the viewport.
await p.locator('[data-testid="floo-model"] canvas').screenshot({ path: out });
if (errs.length) console.log("console errors:", errs); await b.close();
