/**
 * Real-browser walk of the admin panel: visits every route, records console errors,
 * page exceptions, failed requests and non-2xx API responses, then clicks every
 * enabled button on each page and records what breaks.
 */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";

const BASE = process.env.ADMIN_URL ?? "http://127.0.0.1:3000";
const ROUTES = [
  "/", "/users", "/muscles", "/exercises", "/programs",
  "/goals-settings", "/mascot", "/foods", "/scans", "/settings",
];

const problems = [];
const log = (route, kind, detail) => {
  problems.push({ route, kind, detail: String(detail).slice(0, 400) });
  console.log(`[${kind}] ${route} :: ${String(detail).slice(0, 260)}`);
};

const IGNORE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /react-devtools/i,
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let current = "boot";

page.on("console", (m) => {
  if (m.type() !== "error" && m.type() !== "warning") return;
  const t = m.text();
  if (IGNORE.some((r) => r.test(t))) return;
  log(current, m.type() === "error" ? "console-error" : "console-warn", t);
});
page.on("pageerror", (e) => log(current, "page-exception", e.message));
page.on("requestfailed", (r) => {
  const f = r.failure()?.errorText ?? "";
  if (/ERR_ABORTED/.test(f)) return;
  log(current, "request-failed", `${r.method()} ${r.url()} :: ${f}`);
});
page.on("response", async (r) => {
  const u = r.url();
  if (!u.includes("/api/v1/")) return;
  if (r.status() >= 400) {
    let body = "";
    try { body = (await r.text()).slice(0, 200); } catch {}
    log(current, `api-${r.status()}`, `${r.request().method()} ${u.replace(BASE, "")} :: ${body}`);
  }
});

async function settle(ms = 1200) { await page.waitForTimeout(ms); }

// ---- login ----
current = "/login";
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" }).catch((e) => log(current, "nav-failed", e.message));
await settle();
const userField = page.locator('input[name="username"], input#username, input[type="text"]').first();
const passField = page.locator('input[type="password"]').first();
if (!(await userField.count())) log(current, "missing-element", "username input not found on /login");
else {
  await userField.fill("eren");
  await passField.fill("Asd*123");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => log(current, "login-stuck", "still on /login after submit")),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await settle(2000);
}
console.log("after login URL:", page.url());

// ---- every route ----
for (const route of ROUTES) {
  current = route;
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) { log(route, "nav-failed", e.message); continue; }
  await settle(1500);
  if (page.url().includes("/login")) { log(route, "redirected-to-login", page.url()); continue; }

  const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
  if (/Application error|Unhandled Runtime Error|This page could not be found|Bir şeyler ters gitti/i.test(bodyText))
    log(route, "error-page", bodyText.split("\n").slice(0, 4).join(" | "));
  if (bodyText.trim().length < 40) log(route, "blank-page", `only ${bodyText.trim().length} chars rendered`);

  // click every enabled, visible button that is not obviously destructive
  const buttons = page.locator("button:visible:not([disabled])");
  const n = Math.min(await buttons.count(), 25);
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    let label = "";
    try { label = ((await b.innerText()) || (await b.getAttribute("aria-label")) || "").trim().slice(0, 40); } catch { continue; }
    if (/sil|çıkış|logout|delete|kaldır|sıfırla/i.test(label)) continue;
    current = `${route} [btn:${label || i}]`;
    try {
      await b.click({ timeout: 4000 });
      await settle(700);
      const t = (await page.locator("body").innerText().catch(() => "")) || "";
      if (/Application error|Unhandled Runtime Error/i.test(t)) log(current, "error-page-after-click", t.split("\n").slice(0, 3).join(" | "));
      await page.keyboard.press("Escape").catch(() => {});
      await settle(300);
      if (!page.url().includes(route.split("/")[1] || "")) {
        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
        await settle(600);
      }
    } catch (e) { log(current, "click-failed", e.message); }
  }
  current = route;
}

// ---- a detail route ----
current = "/users -> detail";
await page.goto(`${BASE}/users`, { waitUntil: "networkidle" }).catch(() => {});
await settle(1200);
const firstRowLink = page.locator('a[href^="/users/"]').first();
if (await firstRowLink.count()) {
  await firstRowLink.click().catch((e) => log(current, "click-failed", e.message));
  await settle(2500);
  current = page.url().replace(BASE, "");
  const t = (await page.locator("body").innerText().catch(() => "")) || "";
  if (t.trim().length < 40) log(current, "blank-page", "user detail rendered almost nothing");
} else log(current, "missing-element", "no /users/:id link found in the users table");

current = "/programs -> builder";
await page.goto(`${BASE}/programs`, { waitUntil: "networkidle" }).catch(() => {});
await settle(1200);
const progLink = page.locator('a[href^="/programs/"]').first();
if (await progLink.count()) {
  await progLink.click().catch((e) => log(current, "click-failed", e.message));
  await settle(2500);
  current = page.url().replace(BASE, "");
  const t = (await page.locator("body").innerText().catch(() => "")) || "";
  if (t.trim().length < 40) log(current, "blank-page", "program builder rendered almost nothing");
} else log(current, "missing-element", "no /programs/:id link found");

await browser.close();
fs.writeFileSync("/tmp/admin-problems.json", JSON.stringify(problems, null, 2));
console.log(`\n==== ${problems.length} problems ====`);
const byKind = {};
for (const p of problems) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
console.log(byKind);
