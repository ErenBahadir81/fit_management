/** Deep audit of the mobile web build against the real API: login, every tab, every button. */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
const BASE = process.env.MOBILE_URL ?? "http://127.0.0.1:8082";
const problems = [];
let where = "boot";
const fail = (w, x) => { problems.push({ where: w, what: String(x).slice(0, 300) }); console.log(`  ✗ [${w}] ${String(x).slice(0, 230)}`); };
const ok = (w, x) => console.log(`  ✓ [${w}] ${x}`);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => fail(where, `PAGE EXCEPTION: ${e.message}`));
p.on("console", (m) => { if (m.type() === "error" && !/DevTools/i.test(m.text())) fail(where, `console.error: ${m.text()}`); });
p.on("response", async (r) => {
  if (!r.url().includes("/api/v1/") || r.status() < 400) return;
  let body = ""; try { body = (await r.text()).slice(0, 150); } catch {}
  fail(where, `API ${r.status()} ${r.request().method()} ${r.url().split("/api/v1")[1]} :: ${body}`);
});
const txt = async () => (await p.locator("body").innerText().catch(() => "")) || "";

where = "/login";
await p.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(4000);
const inputs = p.locator("input");
if ((await inputs.count()) < 2) fail(where, `login has ${await inputs.count()} inputs`);
await inputs.nth(0).fill("eren");
await inputs.nth(1).fill("Asd*123");
await p.locator("text=Giriş yap").last().click();
await p.waitForTimeout(7000);
console.log("after login URL:", p.url());
const homeText = await txt();
if (/Giriş yap/.test(homeText) && !/Merhaba/.test(homeText)) fail(where, "still on login after submitting valid credentials");
else ok(where, "logged in");
await p.screenshot({ path: "/tmp/shots/m-home.png", fullPage: true });

const TABS = [
  ["Özet", ["Merhaba"], "m-home"],
  ["Program", ["Program", "Bugün"], "m-program"],
  ["Beslenme", ["kcal", "Kahvaltı"], "m-nutrition"],
  ["Vücut", ["kg", "Ölçüm"], "m-body"],
  ["Profil", ["Ölçüm günü", "Çıkış"], "m-profile"],
];
for (const [label, needles, shot] of TABS) {
  where = `tab:${label}`;
  const tab = p.locator(`text=${label}`).last();
  if (!(await tab.count())) { fail(where, `tab "${label}" not found in the tab bar`); continue; }
  try { await tab.click({ timeout: 8000 }); } catch (e) { fail(where, `tab click failed: ${e.message}`); continue; }
  await p.waitForTimeout(5000);
  const t = await txt();
  await p.screenshot({ path: `/tmp/shots/${shot}.png`, fullPage: true });
  if (t.trim().length < 60) fail(where, `screen almost empty (${t.trim().length} chars)`);
  const missing = needles.filter((n) => !t.includes(n));
  if (missing.length === needles.length) fail(where, `none of the expected content rendered (looked for ${needles.join(", ")}); got: ${t.slice(0,160).replace(/\n+/g," | ")}`);
  else ok(where, `rendered (${t.trim().length} chars)`);
}

// click through every visible button on each tab
for (const [label] of TABS) {
  const tab = p.locator(`text=${label}`).last();
  if (!(await tab.count())) continue;
  await tab.click().catch(() => {});
  await p.waitForTimeout(3000);
  const clickable = p.locator('[role="button"]:visible, button:visible');
  const n = Math.min(await clickable.count(), 14);
  for (let i = 0; i < n; i++) {
    const el = clickable.nth(i);
    let name = "";
    try { name = ((await el.innerText()) || (await el.getAttribute("aria-label")) || "").trim().replace(/\s+/g, " ").slice(0, 28); } catch { continue; }
    if (/çıkış|sil|kaldır/i.test(name)) continue;
    where = `${label} [${name || i}]`;
    try {
      await el.click({ timeout: 4000 });
      await p.waitForTimeout(1200);
      const t = await txt();
      if (t.trim().length < 40) fail(where, "screen went blank after click");
    } catch (e) { if (!/intercepts pointer|not visible|detached/i.test(e.message)) fail(where, `click failed: ${e.message}`); }
    await p.keyboard.press("Escape").catch(() => {});
    await p.waitForTimeout(400);
  }
}
await b.close();
fs.writeFileSync("/tmp/mobile-audit.json", JSON.stringify(problems, null, 2));
console.log(`\n==== ${problems.length} problems ====`);
