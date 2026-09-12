/**
 * Mobile (web build) smoke: every tab must render real content with no overlapping cards,
 * no console errors and no failing API call. This is the check that would have caught the
 * blank Program / Beslenme / Vücut tabs.
 */
import { assertScreenHealthy, createRecorder, loginMobile, MOBILE_URL, open } from "./lib/browser.mjs";

const rec = createRecorder();
const h = await open({ rec });

const TABS = [
  { route: "/", where: "mobile/home", needles: ["Bugünün antrenmanı"], minText: 200 },
  { route: "/program", where: "mobile/program", needles: ["Program"], minText: 200 },
  { route: "/nutrition", where: "mobile/nutrition", needles: ["Beslenme"], minText: 200 },
  { route: "/body", where: "mobile/body", needles: ["Vücut"], minText: 200 },
  { route: "/profile", where: "mobile/profile", needles: ["Ölçüm günü"], minText: 200 },
];

if (await loginMobile(h, rec)) {
  for (const t of TABS) {
    h.setWhere(t.where);
    await h.page.goto(`${MOBILE_URL}${t.route}`, { waitUntil: "networkidle", timeout: 60_000 });
    await h.page.waitForTimeout(4500);
    if (await assertScreenHealthy(h, rec, t.where, { needles: t.needles, minText: t.minText })) rec.ok(t.where, "renders");
  }

  // Tab bar navigation must work too (not just deep links).
  for (const [id, where] of [
    ["tab-program", "mobile/tab→program"],
    ["tab-nutrition", "mobile/tab→nutrition"],
    ["tab-body", "mobile/tab→body"],
    ["tab-index", "mobile/tab→home"],
  ]) {
    h.setWhere(where);
    const tab = h.page.locator(`[data-testid="${id}"]`);
    if (!(await tab.count())) {
      rec.fail(where, `tab ${id} missing`);
      continue;
    }
    await tab.click();
    await h.page.waitForTimeout(3500);
    if (await assertScreenHealthy(h, rec, where, { minText: 150 })) rec.ok(where, "switches");
  }
}

await h.close();
process.exit(rec.summary("mobile e2e") === 0 ? 0 : 1);
