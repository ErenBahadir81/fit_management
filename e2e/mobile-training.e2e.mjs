/**
 * Mobile TRAINING end-to-end: the Program tab, the workout logger modal, recovery, history and the
 * program editor — driven the way a person drives them, in a real browser.
 *
 * Why this file exists: every jest test in `apps/mobile` mocks the list, the sheet and the
 * navigator, so a button can be wired to nothing and a whole screen can render blank while the unit
 * suite stays green. Everything asserted here is something a user would see or press.
 *
 * Regressions guarded (each one was really broken at some point):
 *   - `@fastify/cors` v11 defaults `methods` to the CORS-safelisted set, so PUT/DELETE from the web
 *     build died in preflight: saving the program editor and deleting a log both silently failed.
 *   - react-native-web renders the ScrollView *inside* the `refreshControl` element, so the Program
 *     list blanks out unless `ListRefreshControl` forwards children.
 *   - Reanimated `entering` animations position cards absolutely on web, stacking them on top of
 *     each other (`assertScreenHealthy` checks for that).
 *   - The horizontal pager in the logger must lay panes out one screen wide and auto-advance to the
 *     next exercise once the last set of the current one is logged.
 *
 * Run: `node e2e/mobile-training.e2e.mjs` with MOBILE_URL / API_URL pointing at a running stack.
 */
import { assertScreenHealthy, createRecorder, loginMobile, MOBILE_URL, open } from "./lib/browser.mjs";

const rec = createRecorder();
const h = await open({ rec });
const page = h.page;

const T = (id) => page.locator(`[data-testid="${id}"]`);
const count = (id) => T(id).count();
const text = async (id) => (await T(id).innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const wait = (ms) => page.waitForTimeout(ms);

/** Bottom sheets close on a backdrop press; Escape does nothing in `@gorhom/bottom-sheet` on web. */
async function closeSheet() {
  await page.mouse.click(210, 24);
  await wait(900);
}

/**
 * A cold boot of the app. Two traps: Playwright's `goto` to the URL the page is already on does not
 * remount, and the query cache is persisted to localStorage and hydrated synchronously with a 30 s
 * `staleTime` — so a plain reload paints the previous data and never hits the network at all. Drop
 * the persisted cache (but keep the session) and bounce through about:blank.
 */
async function coldBoot(route = "/program") {
  await page.evaluate(() => localStorage.removeItem("fitfloow\\query.cache.v1")).catch(() => {});
  await page.goto("about:blank");
  await page.goto(`${MOBILE_URL}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
  await wait(4500);
}

const gotoProgram = () => coldBoot("/program");

/**
 * Puts the day back to "not logged yet" so the suite can be run twice in a row. `undo-last`
 * invalidates six queries, so the card can flip back and forth for a moment — poll until the
 * "start" action has actually settled instead of trusting the first render.
 */
async function undoTodayIfLogged() {
  if (await count("undo-today")) {
    await T("undo-today").click();
    await wait(2500);
  }
  for (let i = 0; i < 12; i++) {
    if ((await count("undo-today")) === 0 && (await count("start-workout")) === 1) return true;
    await wait(1000);
  }
  return false;
}

function expect(where, what, ok) {
  if (ok) rec.ok(where, what);
  else rec.fail(where, what);
  return ok;
}

if (await loginMobile(h, rec)) {
  /* ------------------------------- program tab ------------------------------ */
  h.setWhere("training/program");
  await gotoProgram();
  await undoTodayIfLogged();
  await assertScreenHealthy(h, rec, "training/program", { needles: ["Program", "Haftalık hacim", "Geçmiş"], minText: 300 });
  expect("training/program", "week strip renders 7 days", (await page.locator('[data-testid^="week-day-"]').count()) === 7);
  expect("training/program", "current day card renders", (await count("current-day-card")) === 1);
  expect("training/program", "volume card renders", (await count("volume-card")) === 1);
  expect("training/program", "start action present", (await count("start-workout")) === 1);

  h.setWhere("training/volume-toggle");
  if (await count("volume-toggle")) {
    const before = await page.locator('[data-testid^="volume-"]').count();
    await T("volume-toggle").click();
    await wait(600);
    expect("training/volume-toggle", "expands the muscle list", (await page.locator('[data-testid^="volume-"]').count()) > before);
    await T("volume-toggle").click();
    await wait(400);
  }

  h.setWhere("training/week-strip");
  const stripDays = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="week-day-"]')].map((e) => e.dataset.testid));
  await T(stripDays[3]).click();
  await wait(800);
  expect("training/week-strip", "selecting a day updates the caption", (await text("week-strip-caption")).length > 0);

  /* ---------------------------- recovery segment ---------------------------- */
  h.setWhere("training/recovery");
  await T("training-tabs").locator("text=Toparlanma").click();
  await wait(3000);
  await assertScreenHealthy(h, rec, "training/recovery", { needles: ["Genel toparlanma"], minText: 200 });
  const muscles = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="muscle-"]')].map((e) => e.dataset.testid).filter((t) => t !== "muscle-grid" && !t.startsWith("muscle-sheet"))
  );
  expect("training/recovery", `muscle grid renders ${muscles.length} cards`, muscles.length > 0);
  if (muscles.length) {
    await T(muscles[0]).click();
    await wait(1500);
    expect("training/recovery", "muscle card opens the detail sheet", (await T("muscle-sheet").isVisible().catch(() => false)) === true);
    expect("training/recovery", "detail sheet draws the recovery curve", (await count("recovery-curve")) === 1);
    await closeSheet();
  }
  await T("training-tabs").locator("text=Program").click();
  await wait(2500);
  expect("training/recovery", "segmented control switches back to the program pane", (await count("current-day-card")) === 1);

  /* ------------------------------ jump / skip ------------------------------- */
  h.setWhere("training/jump");
  await T("jump-day").first().click();
  await wait(1500);
  expect("training/jump", "jump sheet lists the cycle days", (await page.locator('[data-testid^="jump-day-"]').count()) > 1);
  const dayBefore = await text("current-day-card");
  // Pick a day the pointer is not already on — and not a rest day, since the rest card has no
  // "Antrenmana başla" and the logger block below needs one.
  // react-native-web drops `accessibilityState.selected` here, so the current day is identified by
  // the spoken label ("…, şu anki gün") instead of aria-selected.
  const otherDay = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid^="jump-day-"]')];
    const usable = rows.filter((e) => !/şu anki gün/.test(e.getAttribute("aria-label") ?? "") && !/Dinlenme/.test(e.innerText));
    return (usable[0] ?? rows[1] ?? rows[0]).dataset.testid;
  });
  await T(otherDay).click();
  await wait(3000);
  expect("training/jump", "picking a day moves the program pointer", (await text("current-day-card")) !== dayBefore);

  h.setWhere("training/skip");
  await T("skip-day").first().click();
  await wait(1500);
  expect("training/skip", "confirm sheet opens with reasons", (await count("skip-sheet")) === 1 && (await count("skip-reason-Yorgunum")) === 1);
  await T("skip-cancel").click();
  await wait(1400);
  expect("training/skip", '"Vazgeç" closes the sheet without skipping', (await T("skip-sheet").isVisible().catch(() => false)) === false && (await count("undo-today")) === 0);
  await T("skip-day").first().click();
  await wait(1500);
  await T("skip-reason-Yorgunum").click();
  await wait(300);
  await T("skip-confirm").click();
  await wait(3500);
  expect("training/skip", "today is marked as skipped", /Bugün atlandı/.test(await text("current-day-card")));
  expect("training/skip", "the skip lands in the history list", (await page.locator('[data-testid^="history-row-"]').count()) > 0);

  /* --------------------- history row → sheet, swipe, undo -------------------- */
  h.setWhere("training/history");
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="history-row-"]')].map((e) => e.dataset.testid));
  await T(rows[0]).scrollIntoViewIfNeeded();
  await wait(400);
  await T(rows[0]).click();
  await wait(1500);
  expect("training/history", "a history row opens the log detail sheet", (await T("log-sheet").isVisible().catch(() => false)) === true);
  expect("training/history", "the detail sheet offers delete", (await count("log-delete")) === 1);
  await closeSheet();

  h.setWhere("training/swipe-delete");
  await T(rows[0]).scrollIntoViewIfNeeded();
  await wait(500);
  const box = await T(rows[0]).boundingBox();
  await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(box.x + box.width - 30 - i * 25, box.y + box.height / 2);
    await wait(25);
  }
  await page.mouse.up();
  await wait(1800);
  expect("training/swipe-delete", "swiping a row removes it and offers undo", (await count("undo-bar")) === 1);
  await T("undo-delete").click();
  await wait(2500);
  expect("training/swipe-delete", "undo brings the row back", (await page.locator('[data-testid^="history-row-"]').count()) > 0);

  h.setWhere("training/sheet-delete");
  await T(rows[0]).scrollIntoViewIfNeeded();
  await wait(500);
  await T(rows[0]).click();
  await wait(1500);
  await T("log-delete").click();
  await wait(2000);
  expect(
    "training/sheet-delete",
    '"Kaydı sil" closes the sheet and removes the row',
    (await T("log-sheet").isVisible().catch(() => false)) === false && (await count("undo-bar")) === 1
  );
  await T("undo-delete").click();
  await wait(2500);
  expect("training/sheet-delete", "and that delete is undoable too", (await page.locator('[data-testid^="history-row-"]').count()) > 0);

  h.setWhere("training/undo-today");
  await undoTodayIfLogged();
  expect("training/undo-today", '"Geri al" reopens the day', (await count("start-workout")) === 1);

  /* ----------------------------- workout logger ----------------------------- */
  h.setWhere("training/logger");
  await T("start-workout").click();
  await wait(3000);
  await assertScreenHealthy(h, rec, "training/logger", { needles: ["set"], minText: 120 });
  expect("training/logger", "the logger opens with a pager and a primary action", (await count("workout-pager")) === 1 && (await count("complete-set")) === 1);

  const geo = await page.evaluate(() => {
    const pager = document.querySelector('[data-testid="workout-pager"]');
    const panes = [...document.querySelectorAll("[data-testid]")].filter((e) => /^(pane|cardio-pane)-/.test(e.dataset.testid) && !/^pane-dot-/.test(e.dataset.testid));
    return { pagerWidth: Math.round(pager.getBoundingClientRect().width), widths: panes.map((e) => Math.round(e.getBoundingClientRect().width)) };
  });
  // One pane per screen: FlashList/flex regressions collapse these to a fraction of the viewport.
  expect("training/logger", "each pane is exactly one screen wide", geo.widths.length > 0 && geo.widths.every((w) => Math.abs(w - geo.pagerWidth) <= 2));

  h.setWhere("training/logger-steppers");
  const repsBefore = await text("reps-0");
  await T("reps-0-inc").click();
  await wait(400);
  expect("training/logger-steppers", "the reps stepper increments", (await text("reps-0")) !== repsBefore);
  const rirBefore = await text("rir-0");
  await T("rir-0-dec").click();
  await wait(400);
  expect("training/logger-steppers", "the RIR stepper decrements", (await text("rir-0")) !== rirBefore);

  h.setWhere("training/logger-set");
  const progressBefore = await text("workout-progress");
  await T("complete-set").click();
  await wait(1200);
  expect("training/logger-set", "completing a set advances the counter", (await text("workout-progress")) !== progressBefore);
  expect("training/logger-set", "the completed set becomes a done row", (await count("set-done-0-0")) === 1);
  expect("training/logger-set", "the rest timer starts", (await count("rest-timer")) === 1);
  // The rest chip pulses forever, so Playwright's stability check never settles on it.
  await T("rest-timer").click({ force: true });
  await wait(900);
  expect("training/logger-set", "tapping the rest timer skips the rest", (await count("rest-timer")) === 0);

  h.setWhere("training/logger-draft");
  // Leaving with "Sakla ve çık" must keep the in-progress session on the device.
  const loggedSoFar = await text("workout-progress");
  await T("workout-close").click();
  await wait(1600);
  expect("training/logger-draft", "closing a started session asks what to do", (await count("leave-sheet")) === 1);
  await T("leave-keep").click();
  await wait(2800);
  expect("training/logger-draft", '"Sakla ve çık" goes back to the program', (await count("current-day-card")) === 1);
  await T("start-workout").click();
  await wait(3200);
  expect("training/logger-draft", "reopening resumes the saved draft", (await text("workout-progress")) === loggedSoFar);

  h.setWhere("training/logger-sets");
  const withOneMore = await text("workout-progress");
  await T("add-set-0").click();
  await wait(600);
  expect("training/logger-sets", '"Set ekle" adds a set', (await text("workout-progress")) !== withOneMore);
  await T("remove-set-0").click();
  await wait(600);
  expect("training/logger-sets", '"Set sil" removes it again', (await text("workout-progress")) === withOneMore);

  h.setWhere("training/logger-skip-exercise");
  await T("skip-exercise-0").click();
  await wait(800);
  expect("training/logger-skip-exercise", "an exercise can be skipped", (await count("pane-skipped-0")) === 1);
  await T("pane-unskip-0").click();
  await wait(800);
  expect("training/logger-skip-exercise", "and un-skipped", (await count("pane-skipped-0")) === 0);

  h.setWhere("training/logger-add-exercise");
  await T("workout-add-exercise").click();
  await wait(1800);
  expect("training/logger-add-exercise", "the catalog sheet opens with results", (await count("add-exercise-sheet")) === 1);
  const catalog = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="add-exercise-"]')].map((e) => e.dataset.testid).filter((t) => /^add-exercise-[0-9a-f]{8,}$/.test(t)));
  expect("training/logger-add-exercise", `catalog lists ${catalog.length} exercises`, catalog.length > 0);
  const panesBefore = await page.locator('[data-testid^="pane-dot-"]').count();
  await T(catalog[0]).click();
  await wait(1500);
  expect("training/logger-add-exercise", "picking one appends an ad-hoc pane", (await page.locator('[data-testid^="pane-dot-"]').count()) > panesBefore);

  h.setWhere("training/logger-advance");
  // Finish the rest of the first exercise: the pager must auto-advance to the next one.
  for (let i = 0; i < 8; i++) {
    if ((await count("set-active-0")) === 0) break;
    await T("complete-set").click();
    await wait(500);
    if (await count("rest-timer")) await T("rest-timer").click({ force: true });
    await wait(250);
  }
  await wait(1200);
  const scrolled = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="workout-pager"]');
    return { left: Math.round(el.scrollLeft), width: Math.round(el.getBoundingClientRect().width) };
  });
  expect("training/logger-advance", "the pager moves to the next exercise after the last set", scrolled.left >= scrolled.width - 2);

  h.setWhere("training/logger-cardio");
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="workout-pager"]');
    el.scrollLeft = el.scrollWidth;
  });
  await wait(1200);
  if (await page.locator('[data-testid^="cardio-pane-"]').count()) {
    const kmBefore = await text("segment-km-0");
    await T("segment-km-0-inc").click();
    await wait(500);
    expect("training/logger-cardio", "a cardio segment's distance can be edited", (await text("segment-km-0")) !== kmBefore);
    await T("segment-add").click();
    await wait(700);
    expect("training/logger-cardio", '"Bölüm ekle" adds a segment', (await count("segment-1")) === 1);
    await T("segment-remove-1").click();
    await wait(700);
    expect("training/logger-cardio", "and it can be removed again", (await count("segment-1")) === 0);
  } else {
    rec.ok("training/logger-cardio", "today's day has no cardio slot — skipped");
  }

  h.setWhere("training/logger-finish");
  await T("workout-finish").click();
  await wait(1800);
  expect("training/logger-finish", "the finish sheet summarises the session", (await count("finish-sheet")) === 1);
  await T("finish-cancel").click();
  await wait(1500);
  expect("training/logger-finish", '"Devam et" returns to logging', (await T("finish-sheet").isVisible().catch(() => false)) === false && (await count("complete-set")) === 1);
  await T("workout-finish").click();
  await wait(1800);
  await T("rpe-8").click();
  await wait(300);
  await T("finish-note").fill("e2e");
  await wait(400);
  await T("finish-confirm").click();
  // The "Antrenman kaydedildi" moment lasts SAVED_MS (1.4s) before the modal closes itself.
  await wait(900);
  expect("training/logger-finish", "finishing shows the saved state", (await count("workout-saved")) === 1);
  await wait(5000);
  expect("training/logger-finish", "the logger closes itself back to the program", page.url().includes("/program"));
  await wait(2500);
  expect("training/logger-finish", "the session is persisted on the day card", /Bugün tamamlandı/.test(await text("current-day-card")));
  expect("training/logger-finish", "and appears in the history list", (await page.locator('[data-testid^="history-row-"]').count()) > 0);

  h.setWhere("training/logger-detail");
  await T("open-today-log").click();
  await wait(1500);
  const detail = await text("log-sheet");
  expect("training/logger-detail", "the saved log keeps the RPE and the note", /RPE 8/.test(detail) && /e2e/.test(detail));
  await closeSheet();

  /* ---------------------------- pointer + undo ------------------------------ */
  h.setWhere("training/pointer");
  const dayAfterFinish = await text("current-day-card");
  await undoTodayIfLogged();
  expect("training/pointer", '"Geri al" rewinds the completed session', (await text("current-day-card")) !== dayAfterFinish && (await count("start-workout")) === 1);

  /* ----------------------------- program editor ----------------------------- */
  h.setWhere("training/editor");
  await T("edit-program").click();
  await wait(2000);
  expect("training/editor", "the editor sheet lists the cycle days", (await page.locator('[data-testid^="editor-day-"]').count()) > 1);

  // "Vazgeç" must throw the local draft away, not quietly keep it for the next time.
  await T("editor-day-0").click();
  await wait(1200);
  const setsBefore = await text("editor-sets-0");
  await T("editor-sets-0-inc").click();
  await wait(500);
  await T("editor-cancel").click();
  await wait(1800);
  await T("edit-program").click();
  await wait(1800);
  await T("editor-day-0").click();
  await wait(1200);
  expect("training/editor", '"Vazgeç" discards the unsaved draft', (await text("editor-sets-0")) === setsBefore);
  await T("editor-back").click();
  await wait(1000);

  const orderBefore = await text("editor-days");

  // Drag the first day down one row (long-press activates the handle).
  const handle = T("editor-handle-0");
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await wait(400);
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + i * 9);
    await wait(40);
  }
  await page.mouse.up();
  await wait(1200);
  expect("training/editor", "days can be reordered by dragging the handle", (await text("editor-days")) !== orderBefore);

  await T("editor-day-0").click();
  await wait(1500);
  expect("training/editor", "a day opens its own editor", (await count("editor-day")) === 1);
  await T("editor-back").click();
  await wait(1000);
  expect("training/editor", '"Günler" goes back to the day list', (await count("editor-days")) === 1);
  await T("editor-day-0").click();
  await wait(1200);

  const exercisesBefore = await page.locator('[data-testid^="editor-exercise-"]').count();
  await T("editor-add-exercise").click();
  await wait(2000);
  expect("training/editor", "the exercise picker opens", (await count("editor-picker")) === 1);
  await T("picker-back").click();
  await wait(1000);
  expect("training/editor", '"Geri" leaves the picker without adding', (await count("editor-day")) === 1 && (await page.locator('[data-testid^="editor-exercise-"]').count()) === exercisesBefore);
  await T("editor-add-exercise").click();
  await wait(1800);
  const picks = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="picker-item-"]')].map((e) => e.dataset.testid));
  expect("training/editor", `the picker lists ${picks.length} exercises`, picks.length > 0);
  await T(picks[0]).click();
  await wait(1500);
  expect("training/editor", "picking one adds it to the day", (await page.locator('[data-testid^="editor-exercise-"]').count()) === exercisesBefore + 1);
  await T("editor-remove-0").click();
  await wait(800);
  expect("training/editor", "an exercise can be removed", (await page.locator('[data-testid^="editor-exercise-"]').count()) === exercisesBefore);

  // The PUT is the part that used to die in CORS preflight with no visible error at all.
  await T("editor-save").click();
  await wait(4000);
  expect("training/editor", "saving closes the sheet", (await T("editor-sheet").isVisible().catch(() => false)) === false);
  await coldBoot();
  expect("training/editor", "the reordered cycle survives a cold boot", (await count("current-day-card")) === 1);
  await T("edit-program").click();
  await wait(2000);
  expect("training/editor", "the saved order is what the server returns", (await text("editor-days")) !== orderBefore);
  await closeSheet();

  /* ------------------------------ empty + error ----------------------------- */
  h.setWhere("training/empty");
  await page.route("**/api/v1/program", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    const body = await res.json();
    body.program.days = [];
    body.current = { index: 0, day: null };
    body.schedule = [];
    body.weeklyVolume = [];
    await route.fulfill({ response: res, json: body });
  });
  await gotoProgram();
  expect("training/empty", "a program with no days shows the empty state", (await count("no-program")) === 1);
  expect("training/empty", "and hides the editor affordance", (await count("edit-program")) === 0);

  h.setWhere("training/workout-empty");
  await coldBoot("/(modals)/workout");
  expect("training/workout-empty", "the logger explains there is nothing to log", (await count("workout-empty")) === 1);

  h.setWhere("training/error");
  await page.unroute("**/api/v1/program");
  // The next few "✗ API 500 GET /program" lines are the injected failure, not a defect — they are
  // dropped from the problem list again once the retry state has been asserted.
  console.log("  … injecting a failing GET /program, the 500s logged below are expected");
  const failed = rec.problems.length;
  await page.route("**/api/v1/program", (route) =>
    route.request().method() === "GET" ? route.fulfill({ status: 500, contentType: "application/json", body: '{"error":{"code":"BOOM","message":"nope"}}' }) : route.continue()
  );
  await gotoProgram();
  await wait(9000);
  const errText = await h.text();
  rec.problems.length = failed; // drop the deliberate 500s
  expect("training/error", "a failing program request shows a retry state", /Program yüklenemedi/.test(errText) && /Tekrar dene/.test(errText));
  await page.unroute("**/api/v1/program");
}

await h.close();
process.exit(rec.summary("mobile training e2e") === 0 ? 0 : 1);
