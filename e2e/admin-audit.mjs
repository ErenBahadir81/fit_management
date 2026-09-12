/**
 * Deep audit of the admin panel against a real API: verifies each page renders real data
 * (not a stuck skeleton), opens every dialog, and exercises real create/edit/save flows.
 */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";

const BASE = process.env.ADMIN_URL ?? "http://127.0.0.1:3000";
const problems = [];
const fail = (where, what) => { problems.push({ where, what: String(what).slice(0, 300) }); console.log(`  ✗ [${where}] ${String(what).slice(0, 220)}`); };
const ok = (where, what) => console.log(`  ✓ [${where}] ${what}`);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
let where = "boot";
page.on("pageerror", (e) => fail(where, `PAGE EXCEPTION: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/DevTools|hmr/i.test(m.text())) fail(where, `console.error: ${m.text()}`); });
page.on("response", async (r) => {
  if (!r.url().includes("/api/v1/") || r.status() < 400) return;
  let body = ""; try { body = (await r.text()).slice(0, 160); } catch {}
  fail(where, `API ${r.status()} ${r.request().method()} ${r.url().split("/api/v1")[1]} :: ${body}`);
});

const txt = async () => (await page.locator("body").innerText().catch(() => "")) || "";
const goto = async (r) => { where = r; await page.goto(`${BASE}${r}`, { waitUntil: "networkidle", timeout: 30000 }); await page.waitForTimeout(1500); };

// login
where = "/login";
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.fill('input[name="username"]', "eren");
await page.fill('input[name="password"]', "Asd*123");
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => fail("/login", "login did not navigate away"));
await page.waitForTimeout(2500);

/** Each page: [route, required text fragments, minimum interactive elements] */
const PAGES = [
  ["/", ["Panel", "KULLANICI"], 3],
  ["/users", ["eren", "inci"], 3],
  ["/muscles", ["Göğüs", "Bacak"], 5],
  ["/exercises", ["Push-up", "Squat"], 3],
  ["/programs", ["Split"], 2],
  ["/goals-settings", ["7700", "Alpert", "yağ"], 5],
  ["/mascot", ["home.morning", "Floo"], 3],
  ["/foods", ["Pilav"], 3],
  ["/scans", [], 1],
  ["/settings", [], 2],
];

for (const [route, needles, minButtons] of PAGES) {
  try { await goto(route); } catch (e) { fail(route, `navigation failed: ${e.message}`); continue; }
  const t = await txt();
  if (page.url().includes("/login")) { fail(route, "bounced to /login"); continue; }
  if (/Application error|Unhandled Runtime/i.test(t)) { fail(route, `error page: ${t.slice(0, 150)}`); continue; }
  if (t.trim().length < 120) fail(route, `almost nothing rendered (${t.trim().length} chars)`);
  for (const n of needles) if (!t.includes(n)) fail(route, `expected content "${n}" missing — data did not render`);
  if (/Yükleniyor|yükleniyor…/i.test(t) && needles.length && !needles.some((n) => t.includes(n))) fail(route, "stuck on loading state");
  const btns = await page.locator("button:visible:not([disabled])").count();
  if (btns < minButtons) fail(route, `only ${btns} enabled buttons (expected ≥ ${minButtons})`);
  if (problems.filter((p) => p.where.startsWith(route)).length === 0) ok(route, `rendered, ${btns} buttons`);
}

/* ---------- real workflows ---------- */

// 1. create a user
where = "/users create";
await goto("/users");
const addBtn = page.locator("button", { hasText: /yeni|ekle|\+/i }).first();
if (!(await addBtn.count())) fail(where, "no 'new user' button found");
else {
  await addBtn.click(); await page.waitForTimeout(900);
  const uname = `test${Date.now() % 100000}`;
  const inputs = { username: uname, displayName: "Test Kullanıcı", password: "Test*1234" };
  for (const [name, val] of Object.entries(inputs)) {
    const f = page.locator(`input[name="${name}"]`).first();
    if (await f.count()) await f.fill(val); else fail(where, `form field "${name}" not found in the create dialog`);
  }
  const save = page.locator('button[type="submit"], button', { hasText: /kaydet|oluştur|ekle/i }).last();
  await save.click().catch((e) => fail(where, `save click failed: ${e.message}`));
  await page.waitForTimeout(2500);
  const t = await txt();
  if (!t.includes(uname)) fail(where, `created user "${uname}" does not appear in the list after save`);
  else ok(where, `created ${uname}`);
}

// 2. edit a muscle inline and verify it persists
where = "/muscles edit";
await goto("/muscles");
const nameInputs = page.locator('input[type="text"]:visible');
if (!(await nameInputs.count())) fail(where, "no inline-editable inputs on /muscles");
else {
  const first = nameInputs.first();
  const before = await first.inputValue();
  await first.fill(`${before}X`);
  await first.blur();
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const after = await page.locator('input[type="text"]:visible').first().inputValue().catch(() => "");
  if (after !== `${before}X`) fail(where, `inline edit did not persist (before="${before}" typed="${before}X" after reload="${after}")`);
  else { ok(where, "inline edit persisted"); await page.locator('input[type="text"]:visible').first().fill(before); await page.locator('input[type="text"]:visible').first().blur(); await page.waitForTimeout(1200); }
}

// 3. goal settings: change a constant and save
where = "/goals-settings save";
await goto("/goals-settings");
const numberInputs = page.locator('input[type="number"]:visible');
const cnt = await numberInputs.count();
if (cnt === 0) fail(where, "no numeric inputs on the goal settings page");
else {
  const saveBtn = page.locator("button", { hasText: /kaydet/i }).first();
  if (!(await saveBtn.count())) fail(where, "no save button on goal settings");
  else {
    const f = numberInputs.first();
    const v = await f.inputValue();
    await f.fill(String(Number(v) || 7700));
    await page.waitForTimeout(500);
    await saveBtn.click({ timeout: 5000 }).catch((e) => fail(where, `save click failed: ${e.message}`));
    await page.waitForTimeout(2500);
    ok(where, "settings save attempted");
  }
}

// 4. program builder
where = "/programs builder";
await goto("/programs");
const pLink = page.locator('a[href^="/programs/"]').first();
if (!(await pLink.count())) fail(where, "no program template links on /programs");
else {
  await pLink.click(); await page.waitForTimeout(3000);
  where = page.url().replace(BASE, "");
  const t = await txt();
  if (t.trim().length < 200) fail(where, `builder rendered almost nothing (${t.trim().length} chars)`);
  if (!/Push|Bacak|Kondisyon/i.test(t)) fail(where, "builder shows no program days");
  else ok(where, "builder rendered days");
}

// 5. exercises dialog
where = "/exercises dialog";
await goto("/exercises");
const exRow = page.locator("button", { hasText: /düzenle|Push-up/i }).first();
if (await exRow.count()) {
  await exRow.click(); await page.waitForTimeout(1200);
  const t = await txt();
  if (!/kas|yük|set|tekrar/i.test(t)) fail(where, "exercise dialog did not show its fields");
  else ok(where, "exercise dialog opened");
} else fail(where, "could not find an exercise edit affordance");

// 6. foods search
where = "/foods search";
await goto("/foods");
const search = page.locator('input[type="search"], input[placeholder*="ra"], input[placeholder*="Ara"]').first();
if (await search.count()) {
  await search.fill("pilav"); await page.waitForTimeout(2500);
  const t = await txt();
  if (!/pilav/i.test(t)) fail(where, "searching 'pilav' returned nothing visible");
  else ok(where, "food search works");
} else fail(where, "no search input on /foods");

await browser.close();
fs.writeFileSync("/tmp/admin-audit.json", JSON.stringify(problems, null, 2));
console.log(`\n==== ${problems.length} problems ====`);
