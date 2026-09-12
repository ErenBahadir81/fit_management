/**
 * Shared helpers for the browser end-to-end checks.
 *
 * These exist because every unit test in this repo mocks the list, the camera and the navigator —
 * so a screen can render completely blank while 331 jest tests stay green. Anything that must be
 * true in a real browser belongs here.
 */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

export const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
export const MOBILE_URL = process.env.MOBILE_URL ?? "http://127.0.0.1:8082";
export const ADMIN_URL = process.env.ADMIN_URL ?? "http://127.0.0.1:3000";
export const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";
export const USER = { username: process.env.E2E_USER ?? "eren", password: process.env.E2E_PASS ?? "Asd*123" };

const IGNORED_CONSOLE = [/DevTools/i, /hmr/i, /Fast Refresh/i, /\[expo-notifications\]/i];

export function createRecorder() {
  const problems = [];
  return {
    problems,
    fail(where, what) {
      problems.push({ where, what: String(what).slice(0, 400) });
      console.log(`  ✗ [${where}] ${String(what).slice(0, 260)}`);
    },
    ok(where, what) {
      console.log(`  ✓ [${where}] ${what}`);
    },
    summary(label) {
      console.log(`\n==== ${label}: ${problems.length} problem(s) ====`);
      for (const p of problems) console.log(`  - [${p.where}] ${p.what}`);
      return problems.length;
    },
  };
}

/** Launches a browser and wires console/page/network failures into the recorder. */
export async function open({ rec, viewport = { width: 420, height: 900 }, context = {} }) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport, ...context });
  const page = await ctx.newPage();
  const state = { where: "boot" };
  const at = () => state.where;

  page.on("pageerror", (e) => rec.fail(at(), `page exception: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (IGNORED_CONSOLE.some((r) => r.test(t))) return;
    rec.fail(at(), `console.error: ${t}`);
  });
  page.on("requestfailed", (r) => {
    const err = r.failure()?.errorText ?? "";
    if (/ERR_ABORTED/.test(err)) return;
    rec.fail(at(), `request failed: ${r.method()} ${r.url()} (${err})`);
  });
  page.on("response", async (r) => {
    if (!r.url().includes("/api/v1/") || r.status() < 400) return;
    if (r.status() === 401 && /\/auth\/(me|refresh)/.test(r.url())) return; // expected before login
    let body = "";
    try {
      body = (await r.text()).slice(0, 160);
    } catch {}
    rec.fail(at(), `API ${r.status()} ${r.request().method()} ${r.url().split("/api/v1")[1]} :: ${body}`);
  });

  return {
    browser,
    ctx,
    page,
    setWhere: (w) => {
      state.where = w;
    },
    text: async () => (await page.locator("body").innerText().catch(() => "")) || "",
    close: () => browser.close(),
  };
}

export async function loginMobile(h, rec) {
  h.setWhere("mobile/login");
  await h.page.goto(MOBILE_URL, { waitUntil: "networkidle", timeout: 90_000 });
  await h.page.waitForTimeout(3500);
  const inputs = h.page.locator("input");
  if ((await inputs.count()) < 2) {
    rec.fail("mobile/login", "login form did not render two inputs");
    return false;
  }
  await inputs.nth(0).fill(USER.username);
  await inputs.nth(1).fill(USER.password);
  await h.page.locator("text=Giriş yap").last().click();
  await h.page.waitForTimeout(6000);
  const t = await h.text();
  if (/Giriş yap/.test(t) && !/Merhaba|İyi/.test(t)) {
    rec.fail("mobile/login", "still on the login screen after valid credentials");
    return false;
  }
  return true;
}

export async function loginAdmin(h, rec) {
  h.setWhere("admin/login");
  await h.page.goto(`${ADMIN_URL}/login`, { waitUntil: "networkidle", timeout: 90_000 });
  await h.page.waitForTimeout(1500);
  await h.page.fill('input[name="username"]', USER.username);
  await h.page.fill('input[name="password"]', USER.password);
  await h.page.locator('button[type="submit"]').click();
  await h.page
    .waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25_000 })
    .catch(() => rec.fail("admin/login", "login did not navigate away from /login"));
  await h.page.waitForTimeout(2500);
  return !h.page.url().includes("/login");
}

/** Fails when a screen renders nothing meaningful, or when its cards overlap each other. */
export async function assertScreenHealthy(h, rec, where, { minText = 80, needles = [] } = {}) {
  const t = await h.text();
  if (t.trim().length < minText) {
    rec.fail(where, `screen rendered almost nothing (${t.trim().length} chars)`);
    return false;
  }
  if (/Bu ekran yüklenemedi|Application error|Unhandled Runtime/i.test(t)) {
    rec.fail(where, `error state on screen: ${t.slice(0, 160).replace(/\n+/g, " | ")}`);
    return false;
  }
  const missing = needles.filter((n) => !t.includes(n));
  if (missing.length) rec.fail(where, `expected content missing: ${missing.join(", ")}`);
  const overlaps = await findOverlaps(h.page);
  if (overlaps.length) rec.fail(where, `overlapping content: ${overlaps.slice(0, 3).join(" | ")}`);
  return missing.length === 0 && overlaps.length === 0;
}

/**
 * Cards drawn on top of each other is exactly how the Reanimated `position: absolute` regression
 * looked, so it is asserted rather than eyeballed: sibling text blocks must not share pixels.
 */
export async function findOverlaps(page) {
  return page.evaluate(() => {
    // Leaf text blocks only: a wrapper always "overlaps" its own child, which is not a defect.
    // The floating tab bar deliberately sits above scrolling content; it is not an overlap defect.
    const chrome = [...document.querySelectorAll('[data-testid^="tab-"], [data-testid="tabbar-pill"]')];
    const inChrome = (el) => chrome.some((c) => c === el || c.contains(el));
    const leaves = [...document.querySelectorAll("div,span,h1,h2,h3,p")].filter((el) => {
      if (inChrome(el)) return false;
      const txt = (el.innerText || "").trim();
      if (!txt || txt.length < 6) return false;
      if ([...el.children].some((c) => (c.innerText || "").trim().length >= 6)) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) return false;
      const r = el.getBoundingClientRect();
      return r.width > 40 && r.height > 10 && r.bottom > 0 && r.top < 3000;
    });
    const hits = [];
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const ea = leaves[i];
        const eb = leaves[j];
        if (ea.contains(eb) || eb.contains(ea)) continue;
        const a = ea.getBoundingClientRect();
        const b = eb.getBoundingClientRect();
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        // Require a real intersection of both text boxes, not a 1-2 px rounding kiss.
        if (ox > 24 && oy > 8) {
          const ta = (ea.innerText || "").replace(/\s+/g, " ").slice(0, 22);
          const tb = (eb.innerText || "").replace(/\s+/g, " ").slice(0, 22);
          hits.push(`"${ta}" ↔ "${tb}"`);
        }
      }
    }
    return [...new Set(hits)];
  });
}
