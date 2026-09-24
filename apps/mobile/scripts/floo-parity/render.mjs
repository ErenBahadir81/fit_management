// Usage: node render.mjs <out.png>  — screenshots the playground canvas (idle mood, hydration 100, no pointer)
import { chromium } from "playwright";
const out = process.argv[2];
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 520, height: 900 }, reducedMotion: "reduce", deviceScaleFactor: 3 });
const errs = []; p.on("console", m => m.type() === "error" && errs.push(m.text()));
await p.goto("http://localhost:3000/mascot-playground"); await p.waitForSelector('[data-testid="mood-happy"]', { timeout: 60000 });
await p.click('[data-testid="mood-idle"]'); await p.click('[data-testid="hydration-100"]'); await p.mouse.move(5, 5);
await p.evaluate(() => { const el = document.querySelector('[data-testid="floo-stage"]'); if (el) { el.style.backgroundColor = "#A0BAC7"; el.style.borderColor = "#A0BAC7"; } });
await p.waitForTimeout(2200);
const box = await (await p.$('canvas')).boundingBox();
await p.screenshot({ path: out, clip: box });
if (errs.length) console.log("console errors:", errs); await b.close();
