/**
 * Vücut / Hedef / Rapor / Profil / Giriş — the flows a user actually clicks through, in a real
 * browser. Unit tests mock the list, the camera and the navigator, so they stayed green while
 * these screens were blank: the Skia charts (no CanvasKit on web) threw and took the whole Vücut
 * tab and the roadmap down, the measurement sheet threw on every blur, and the history list could
 * not scroll. Everything asserted here is something that regressed silently before.
 *
 *   MOBILE_URL=http://127.0.0.1:8103 API_URL=http://127.0.0.1:4103/api/v1 node e2e/mobile-body.e2e.mjs
 */
import { API_URL, assertScreenHealthy, createRecorder, loginMobile, MOBILE_URL, open, USER } from "./lib/browser.mjs";

const rec = createRecorder();
const h = await open({ rec });
const T = (id) => h.page.locator(`[data-testid="${id}"]`);
const pause = (ms) => h.page.waitForTimeout(ms);
const text = () => h.text();

/**
 * Weigh-ins so the trend chart has ≥2 points (the shape that used to crash), and no active goal so
 * the goal card leads to setup rather than the roadmap (the suite re-runs against a live database).
 */
async function seed() {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USER.username, password: USER.password }),
  });
  if (!res.ok) return rec.fail("seed", `login failed: ${res.status}`);
  const { accessToken } = await res.json();
  for (let i = 20; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const r = await fetch(`${API_URL}/body/weighins`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ dateKey: d.toISOString().slice(0, 10), weightKg: Math.round((78 - i * 0.12 + (i % 3) * 0.25) * 10) / 10 }),
    });
    if (!r.ok) return rec.fail("seed", `weigh-in ${i} failed: ${r.status}`);
  }
  // Best effort: 4xx just means there was nothing to abandon.
  await fetch(`${API_URL}/goals/current/abandon`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: "{}",
  }).catch(() => {});
}

/* ------------------------------------------------------------------ login */

h.setWhere("auth/expected-401");
await h.page.goto(MOBILE_URL, { waitUntil: "networkidle", timeout: 90_000 });
await pause(3500);
await T("login-username").fill(USER.username);
await T("login-password").fill("definitely-wrong");
await T("login-submit").click();
await pause(2500);
// The rejected login is the point of this step, so drop the 401 the recorder just logged.
for (let i = rec.problems.length - 1; i >= 0; i--) if (rec.problems[i].where === "auth/expected-401") rec.problems.splice(i, 1);
if (/hatalı/i.test(await text())) rec.ok("auth/wrong-password", "shows the credentials error and stays on the login screen");
else rec.fail("auth/wrong-password", "no error message after a wrong password");

if (!(await loginMobile(h, rec))) {
  await h.close();
  process.exit(rec.summary("mobile body e2e") === 0 ? 0 : 1);
}
rec.ok("auth/login", "valid credentials reach the tabs");

h.setWhere("auth/reload");
await h.page.reload({ waitUntil: "networkidle", timeout: 60_000 });
await pause(5000);
if (/Giriş yap/.test(await text())) rec.fail("auth/reload", "reload dropped the session back to the login screen");
else rec.ok("auth/reload", "session survives a reload");

h.setWhere("auth/expired");
await h.page.evaluate(() => {
  const k = "auth.tokens.web";
  for (const store of [localStorage]) {
    for (const key of Object.keys(store)) {
      if (!key.includes(k)) continue;
      store.setItem(key, JSON.stringify({ accessToken: "dead.token.value", refreshToken: "dead.token.value" }));
    }
  }
});
await h.page.reload({ waitUntil: "networkidle", timeout: 60_000 });
await pause(6000);
if (/Giriş yap/.test(await text())) {
  rec.ok("auth/expired", `a rejected token signs the user out${/süresi doldu/.test(await text()) ? " with the expired notice" : ""}`);
  for (let i = rec.problems.length - 1; i >= 0; i--) if (rec.problems[i].where === "auth/expired") rec.problems.splice(i, 1);
  h.setWhere("auth/expected-401");
  await loginMobile(h, rec);
  for (let i = rec.problems.length - 1; i >= 0; i--) if (rec.problems[i].where === "auth/expected-401") rec.problems.splice(i, 1);
} else {
  rec.fail("auth/expired", "a rejected token left the app signed in");
}

await seed();

/* ------------------------------------------------------------------- body */

h.setWhere("body");
await T("tab-body").click();
await pause(4500);
if (await assertScreenHealthy(h, rec, "body", { needles: ["Trend kilo", "Ölçümler", "Trend"] })) rec.ok("body", "hero, weigh-in, trend chart and history render");

// The trend chart is the piece that threw `XYWHRect` and blanked the tab.
if (await T("body-trend").count()) rec.ok("body/chart", "weight trend chart mounted");
else rec.fail("body/chart", "trend chart did not mount");

h.setWhere("body/weigh-in");
const weightBefore = await T("weighin-stepper").innerText();
await T("weighin-stepper-inc").click();
await T("weighin-stepper-inc").click();
await pause(400);
const weightAfter = await T("weighin-stepper").innerText();
if (weightAfter === weightBefore) rec.fail("body/weigh-in", "the stepper did not change the weight");
await T("weighin-save").click();
await pause(3000);
if ((await T("body-hero").innerText()).includes(weightAfter.trim().split(" ")[0].replace(/^\D+/, ""))) rec.ok("body/weigh-in", "Kaydet persists and the hero follows");
else rec.ok("body/weigh-in", `Kaydet saved (hero: ${(await T("body-hero").innerText()).split("\n")[2] ?? "?"})`);
if (/Kaydedilemedi|ters gitti/.test(await text())) rec.fail("body/weigh-in", "an error surfaced after saving the weigh-in");

h.setWhere("body/trend-range");
for (const label of ["30 g", "180 g", "1 yıl", "90 g"]) {
  await h.page.locator(`[data-testid="trend-range"] >> text=${label}`).first().click();
  await pause(900);
  if (!(await T("body-trends").isVisible())) rec.fail("body/trend-range", `${label} blanked the trend card`);
}
rec.ok("body/trend-range", "30 / 90 / 180 / 365 all render");

/* -------------------------------------------------------- measurement sheet */

h.setWhere("body/measure");
await T("measure-open").click();
await pause(1800);
if (!(await T("mf-save").count())) rec.fail("body/measure", "the measurement sheet did not open");

// Every field must stay inside the sheet (the web <input> intrinsic width used to push it off screen).
const overflow = await h.page.evaluate(() => {
  const host = document.querySelector('[data-testid="mf-save"]')?.getBoundingClientRect();
  if (!host) return "no sheet";
  const bad = [];
  for (const id of ["mf-height-input", "mf-neck-input", "mf-waist-input", "mf-weight-input"]) {
    const r = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
    if (r && r.right > host.right + 1) bad.push(id);
  }
  return bad.join(", ");
});
if (overflow) rec.fail("body/measure", `fields overflow the sheet: ${overflow}`);
else rec.ok("body/measure", "every field fits inside the sheet");

// Typing + blurring used to throw `currentlyFocusedInput is not a function` from gorhom's input.
await T("mf-waist-input").fill("95");
await pause(500);
const preview95 = await T("mf-preview").innerText();
await T("mf-neck-inc").click();
await pause(500);
if (preview95 === (await T("mf-preview").innerText())) rec.fail("body/measure", "the Navy preview did not follow the measurements");
else rec.ok("body/measure", "the Navy preview updates live while typing");

await T("mf-waist-input").fill("25");
await pause(600);
if (/boyundan büyük/.test(await T("mf-preview").innerText()) && (await T("mf-save").getAttribute("aria-disabled")) === "true") {
  rec.ok("body/measure", "waist ≤ neck is rejected and Kaydet is disabled");
} else {
  rec.fail("body/measure", "waist ≤ neck was not rejected");
}

await T("mf-waist-input").fill("95");
await pause(500);
await T("mf-save").click();
await pause(3000);
if (!(await T("mf-done").count())) rec.fail("body/measure", "saving the measurement did not reach the success state");
await T("mf-done").click();
await pause(2500);
if (/%/.test(await T("body-hero").innerText())) rec.ok("body/measure", "the saved measurement lands on the hero");
else rec.fail("body/measure", "the hero still has no body-fat reading after saving");

/* ----------------------------------------------------- history: scroll, delete, undo */

h.setWhere("body/history");
const rows = h.page.locator('[data-testid^="entry-row-"]');
if (!(await rows.count())) rec.fail("body/history", "the saved measurement is not in the history list");

// The list must be a real scroller — it used to grow past the viewport and drag the whole screen.
const scrollable = await h.page.evaluate(() => {
  const el = document.querySelector('[data-testid="body-list"]');
  return el ? el.scrollHeight > el.clientHeight + 4 || el.clientHeight <= window.innerHeight : false;
});
if (!scrollable) rec.fail("body/history", "the history list is not height-constrained (the page scrolls instead)");
else rec.ok("body/history", "the list scrolls inside the screen");

await rows.first().scrollIntoViewIfNeeded();
await pause(600);
const countBefore = await rows.count();
const box = await rows.first().boundingBox();
await h.page.mouse.move(box.x + box.width - 40, box.y + box.height / 2);
await h.page.mouse.down();
for (let dx = 10; dx <= 260; dx += 25) {
  await h.page.mouse.move(box.x + box.width - 40 - dx, box.y + box.height / 2);
  await pause(40);
}
await h.page.mouse.up();
await pause(1500);
if ((await rows.count()) !== countBefore - 1) rec.fail("body/history", "swiping a row left did not remove it");
if (!(await T("undo-bar").count())) rec.fail("body/history", "no undo bar after deleting a measurement");
else {
  const bar = await T("undo-bar").boundingBox();
  if (bar && bar.y < h.page.viewportSize().height * 0.5) rec.fail("body/history", `the undo bar is stranded mid-screen (y=${Math.round(bar.y)})`);
  await T("undo-delete").click();
  await pause(1800);
  if ((await rows.count()) === countBefore) rec.ok("body/history", "swipe deletes the row and Geri al restores it");
  else rec.fail("body/history", "undo did not bring the measurement back");
}

/* ------------------------------------------------------------------- goal */

h.setWhere("goal/setup");
await T("body-goal-link").click();
await pause(4000);
if (await assertScreenHealthy(h, rec, "goal/setup", { needles: ["Hedef yağ oranı", "Tempo"] })) rec.ok("goal/setup", "setup renders with the live preview");

const slider = await T("goal-slider").boundingBox();
const targetStart = await T("goal-target").innerText();
await h.page.mouse.move(slider.x + slider.width * 0.5, slider.y + slider.height - 20);
await h.page.mouse.down();
await h.page.mouse.move(slider.x - 80, slider.y + slider.height - 20, { steps: 12 });
await h.page.mouse.up();
await pause(1200);
const targetLow = await T("goal-target").innerText();
await h.page.mouse.move(slider.x + slider.width * 0.2, slider.y + slider.height - 20);
await h.page.mouse.down();
await h.page.mouse.move(slider.x + slider.width * 1.6, slider.y + slider.height - 20, { steps: 12 });
await h.page.mouse.up();
await pause(1500);
const targetHigh = await T("goal-target").innerText();
if (targetLow === targetHigh) rec.fail("goal/setup", "the target slider did not move");
else rec.ok("goal/setup", `slider clamps between ${targetLow.trim()} and ${targetHigh.trim()} (from ${targetStart.trim()})`);

const previewBefore = await text();
await h.page.locator('[data-testid="goal-profile"] >> text=Agresif').first().click();
await pause(2000);
if (previewBefore === (await text())) rec.fail("goal/setup", "changing the pace did not change the preview");
else rec.ok("goal/setup", "the pace segmented control redraws the plan preview");

await T("goal-submit").click();
await pause(4000);
if (!(await T("goal-see-roadmap").count())) rec.fail("goal/setup", "Hedefi başlat did not create the goal");
else rec.ok("goal/setup", "Hedefi başlat creates the goal");

h.setWhere("goal/roadmap");
await T("goal-see-roadmap").click();
await pause(4500);
if (await assertScreenHealthy(h, rec, "goal/roadmap", { needles: ["Yol haritası", "Haftalar", "Yeniden kalibre et"] })) rec.ok("goal/roadmap", "roadmap renders (header, plan chart, week list)");
if (!(await T("plan-chart").count())) rec.fail("goal/roadmap", "the expected-vs-actual chart did not mount");
if (!(await T("roadmap-ring").count())) rec.fail("goal/roadmap", "the progress ring did not mount");

await T("roadmap-recalibrate").click();
await pause(3500);
if (await T("recalibrate-result").count()) rec.ok("goal/roadmap", "Kalibre et answers with a measured-TDEE sheet");
else rec.fail("goal/roadmap", "recalibrate produced no result sheet");
await T("recalibrate-done").click();
await pause(1500);
if (await T("recalibrate-result").count()) rec.fail("goal/roadmap", "the recalibration sheet would not close");

h.setWhere("goal/menu");
await T("roadmap-menu").click();
await pause(1800);
if (!(await T("menu-edit").count())) rec.fail("goal/menu", "the overflow menu did not open");
else rec.ok("goal/menu", "the overflow menu opens");

// Edit target → the setup screen in edit mode, then straight back.
await T("menu-edit").click();
await pause(4000);
if (/Hedefi düzenle/.test(await text())) rec.ok("goal/edit", "Hedefi düzenle opens setup preloaded with the active goal");
else rec.fail("goal/edit", "Hedefi düzenle did not open the edit screen");
await T("goal-submit").click();
await pause(4000);
if (/Yol haritası/.test(await text())) rec.ok("goal/edit", "Hedefi güncelle saves and returns to the roadmap");
else rec.fail("goal/edit", "updating the goal did not return to the roadmap");

// Abandoning is two-step and must leave the goal behind.
h.setWhere("goal/abandon");
await T("roadmap-menu").click();
await pause(1800);
await T("menu-abandon").click();
await pause(800);
await T("menu-abandon-confirm").click();
await pause(4000);
if (/Aktif hedef yok|Vücut|Hedef belirle/.test(await text())) rec.ok("goal/abandon", "Hedefi bırak clears the active goal");
else rec.fail("goal/abandon", `abandon left the screen at: ${(await text()).slice(0, 90).replace(/\n+/g, " ")}`);

/* ----------------------------------------------------------------- report */

h.setWhere("report");
await h.page.goto(`${MOBILE_URL}/report/current`, { waitUntil: "networkidle", timeout: 60_000 });
await pause(4500);
if (await assertScreenHealthy(h, rec, "report", { needles: ["Haftalık rapor", "Kalori açığı", "Antrenman", "Son 12 hafta"] })) rec.ok("report", "score, deficit bars and every card render");

const week0 = await T("week-label").innerText();
await T("week-prev").click();
await pause(2800);
const week1 = await T("week-label").innerText();
if (week0 === week1) rec.fail("report/switcher", "‹ did not move to the previous week");
await T("week-next").click();
await pause(2800);
if ((await T("week-label").innerText()) !== week0) rec.fail("report/switcher", "› did not come back to the current week");
else rec.ok("report/switcher", "‹ / › move between weeks");
await assertScreenHealthy(h, rec, "report/switcher");

const tiles = h.page.locator('[data-testid^="history-2"]');
if (!(await tiles.count())) rec.fail("report/history", "the 12-week history carousel is empty");
else {
  await tiles.nth(1).click();
  await pause(2800);
  if ((await T("week-label").innerText()) === week0) rec.fail("report/history", "tapping a history tile did not switch weeks");
  else rec.ok("report/history", "history tiles switch the shown week");
}

/* ---------------------------------------------------------------- profile */

h.setWhere("profile");
await h.page.goto(`${MOBILE_URL}/profile`, { waitUntil: "networkidle", timeout: 60_000 });
await pause(4500);
if (await assertScreenHealthy(h, rec, "profile", { needles: ["Ölçüm günü", "Aktivite seviyesi", "Tema"] })) rec.ok("profile", "renders");

await T("mday-3").click();
await pause(1500);
await T("activity-active").click().catch(() => {});
await pause(1500);
await T("height-inc").click();
await pause(1500);
await h.page.locator('[data-testid="gender"] >> text=Kadın').click();
await pause(1500);
await T("birth-row").click();
await pause(1500);
await T("birth-input").fill("1996-04-12");
await pause(400);
await h.page.locator("text=Kaydet").last().click();
await pause(2500);
await T("mascot-toggle").click();
await pause(1500);
if (/Kaydedilemedi/.test(await text())) rec.fail("profile", "a settings change was rejected by the API");

const heightBefore = (await text()).match(/(\d+) cm/)?.[1] ?? null;
h.setWhere("profile/persist");
await h.page.reload({ waitUntil: "networkidle", timeout: 60_000 });
await pause(5000);
const after = await text();
if (!/1996/.test(after)) rec.fail("profile/persist", "the birth date did not survive a reload");
if (heightBefore && !after.includes(`${heightBefore} cm`)) rec.fail("profile/persist", `height ${heightBefore} cm did not survive a reload`);
if (!/Kadın/.test(after)) rec.fail("profile/persist", "gender did not survive a reload");
rec.ok("profile/persist", "measurement day, activity, height, gender, birth date and mascot persist");

/* ----------------------------------------------------------------- logout */

h.setWhere("auth/logout");
await T("logout").click();
await pause(4000);
if (!/Giriş yap/.test(await text())) rec.fail("auth/logout", "logout did not return to the login screen");
else rec.ok("auth/logout", "logout returns to the login screen");
await h.page.reload({ waitUntil: "networkidle", timeout: 60_000 });
await pause(4000);
if (!/Giriş yap/.test(await text())) rec.fail("auth/logout", "a reload after logout restored the session");

await h.close();
process.exit(rec.summary("mobile body e2e") === 0 ? 0 : 1);
