/**
 * Admin panel smoke against a real API: every route renders real data, with no console error,
 * no failing request and no error page.
 */
import { ADMIN_URL, assertScreenHealthy, createRecorder, loginAdmin, open } from "./lib/browser.mjs";

const rec = createRecorder();
const h = await open({ rec, viewport: { width: 1440, height: 1000 } });

const ROUTES = [
  { route: "/", where: "admin/dashboard", needles: ["Panel"] },
  { route: "/users", where: "admin/users", needles: ["eren"] },
  { route: "/muscles", where: "admin/muscles", needles: ["Göğüs"] },
  { route: "/exercises", where: "admin/exercises", needles: ["Squat"] },
  { route: "/programs", where: "admin/programs", needles: ["Split"] },
  { route: "/goals-settings", where: "admin/goals-settings", needles: ["Oran tablosu"] },
  { route: "/mascot", where: "admin/mascot", needles: ["home.morning"] },
  { route: "/foods", where: "admin/foods", needles: [] },
  { route: "/scans", where: "admin/scans", needles: [] },
  { route: "/settings", where: "admin/settings", needles: [] },
];

if (await loginAdmin(h, rec)) {
  for (const r of ROUTES) {
    h.setWhere(r.where);
    await h.page.goto(`${ADMIN_URL}${r.route}`, { waitUntil: "networkidle", timeout: 60_000 });
    await h.page.waitForTimeout(2000);
    if (h.page.url().includes("/login")) {
      rec.fail(r.where, "bounced back to /login");
      continue;
    }
    if (await assertScreenHealthy(h, rec, r.where, { needles: r.needles, minText: 150 })) rec.ok(r.where, "renders");
  }
}

await h.close();
process.exit(rec.summary("admin e2e") === 0 ? 0 : 1);
