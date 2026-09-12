/**
 * Beslenme (nutrition) end-to-end, driven in a real browser.
 *
 * Every jest suite for this feature mocks the list, the sheet, the camera and the navigator, so a
 * screen can be green in unit tests and still be unusable: the add menu opened sheets that were
 * torn down a beat later, the search box threw on blur, the scan upload posted "[object Object]"
 * and the day strip ignored swipes. Nothing here is mocked — it clicks like a user and fails on
 * any console error, page exception or failing request.
 *
 * Needs: the API (VISION_MOCK=1) and the exported web build served over http.
 *   MOBILE_URL=http://127.0.0.1:8102 API_URL=http://127.0.0.1:4102/api/v1 node e2e/mobile-nutrition.e2e.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertScreenHealthy, createRecorder, loginMobile, MOBILE_URL, open } from "./lib/browser.mjs";

const rec = createRecorder();
/** A phone-sized, touch-capable context: swipe gestures behave like a finger, not a mouse. */
const h = await open({ rec, context: { hasTouch: true, isMobile: true } });
const P = h.page;

/**
 * A real (if boring) 64x64 PNG for the scan upload. It is built here rather than committed as a
 * fixture so the suite has no binary dependency; the API decodes it with sharp and, under
 * VISION_MOCK, answers the same detections every run.
 */
const PHOTO = join(tmpdir(), "fitfloow-e2e-scan.png");
writeFileSync(PHOTO, makePng(64));

function makePng(size) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      row[1 + x * 3] = (x * 4) % 256;
      row[2 + x * 3] = (y * 4) % 256;
      row[3 + x * 3] = 128;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

const wait = (ms) => P.waitForTimeout(ms);
const has = async (id) => (await P.locator(`[data-testid="${id}"]`).count()) > 0;
const tap = async (id) => P.locator(`[data-testid="${id}"]`).click();
const body = () => h.text();

/** Ids of the logged rows (the swipe action shares the prefix, so it is filtered out). */
async function entryIds() {
  const all = await P.locator('[data-testid^="entry-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  return all.filter((t) => t && !t.startsWith("entry-delete"));
}

/** react-native-web turns a mouse drag into a tap on release; real touch points do not. */
async function swipeLeft(testID, steps = 5, dx = 18) {
  const box = await P.locator(`[data-testid="${testID}"]`).boundingBox();
  if (!box) return false;
  const cdp = await P.context().newCDPSession(P);
  const y = Math.round(box.y + box.height / 2);
  const x = Math.round(box.x + box.width - 20);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - i * dx, y }] });
    await wait(25);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait(600);
  return true;
}

/** Drag the day strip sideways (positive dx = towards older days). */
async function swipePager(dx) {
  const box = await P.locator('[data-testid="nutrition-day-pager"]').boundingBox();
  if (!box) return false;
  const cdp = await P.context().newCDPSession(P);
  const y = Math.round(box.y + box.height / 2);
  const x = Math.round(box.x + box.width / 2);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + Math.round((dx * i) / 8), y }] });
    await wait(25);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait(2200);
  return true;
}

/** The date the header is showing ("Cumartesi, 12 Eylül" → "12 Eylül"). */
async function shownDate() {
  const t = await body();
  return t.match(/\d{1,2}\s(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)/)?.[0] ?? "?";
}

/** kcal eaten, as the hero card prints it ("763 / 2.000 kcal"). */
async function heroKcal() {
  const t = await P.locator('[data-testid="nutrition-hero"]').innerText().catch(() => "");
  return Number((t.match(/([\d.]+)\s*\/\s*[\d.]+\s*kcal/)?.[1] ?? "0").replace(/\./g, ""));
}

/** FAB → one of the five entries of the add menu. */
async function openAddAction(action) {
  await tap("nutrition-fab");
  await wait(900);
  await tap(`add-${action}`);
  await wait(1800);
}

async function gotoNutrition() {
  await tap("tab-nutrition");
  await wait(3000);
}

async function reloadToNutrition() {
  await P.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await wait(5000);
  await gotoNutrition();
}

if (!(await loginMobile(h, rec))) {
  await h.close();
  process.exit(1);
}

await P.goto(`${MOBILE_URL}/nutrition`, { waitUntil: "networkidle", timeout: 60_000 });
await wait(4000);

/* ---------------------------------------------------------------- day view */
{
  h.setWhere("nutrition/day");
  if (await assertScreenHealthy(h, rec, "nutrition/day", { needles: ["Beslenme", "Kahvaltı", "Öğle", "Akşam", "Ara öğün"], minText: 200 })) rec.ok("nutrition/day", "renders");
  for (const id of ["nutrition-hero", "nutrition-ring", "macro-protein", "macro-carbs", "macro-fat", "nutrition-day-pager", "nutrition-fab", "nutrition-tabs", "open-target"]) {
    if (await has(id)) rec.ok("nutrition/day", `${id} present`);
    else rec.fail("nutrition/day", `${id} missing from the day view`);
  }
  for (const meal of ["breakfast", "lunch", "dinner", "snack"]) {
    if (!(await has(`meal-add-${meal}`))) rec.fail("nutrition/day", `meal-add-${meal} missing`);
  }
}

/* --------------------------------------------------------------- day pager */
{
  h.setWhere("nutrition/pager");
  const today = await shownDate();
  const older = await P.locator('[data-testid^="day-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  const target = older[Math.max(0, older.length - 3)];
  await tap(target);
  await wait(2500);
  const moved = await shownDate();
  if (moved !== today && (await has("jump-today"))) rec.ok("nutrition/pager", `tapping a day switched to ${moved}`);
  else rec.fail("nutrition/pager", `tapping ${target} did not change the day (${today} → ${moved})`);
  if ((await P.locator('[data-testid="nutrition-hero"]').count()) === 0) rec.fail("nutrition/pager", "the picked day never loaded its hero card");

  await tap("jump-today");
  await wait(2200);
  if ((await shownDate()) === today && !(await has("jump-today"))) rec.ok("nutrition/pager", "“Bugün” jumps back");
  else rec.fail("nutrition/pager", "“Bugün” did not return to today");

  // react-native-web never emits onMomentumScrollEnd; the strip has to settle the swipe itself.
  await swipePager(180);
  const swiped = await shownDate();
  if (swiped !== today) rec.ok("nutrition/pager", `swiping the strip switched to ${swiped}`);
  else rec.fail("nutrition/pager", "swiping the day strip selected nothing");
  await tap("jump-today").catch(() => {});
  await wait(2000);
}

/* ---------------------------------------------------------------- Gün/Hafta */
{
  h.setWhere("nutrition/week");
  await P.locator('[data-testid="nutrition-tabs"] >> text=Hafta').click();
  await wait(2500);
  for (const id of ["nutrition-week", "week-bars", "week-adherence", "week-avg", "week-logged"]) {
    if (!(await has(id))) rec.fail("nutrition/week", `${id} missing from the week view`);
  }
  if (await assertScreenHealthy(h, rec, "nutrition/week", { needles: ["Bu hafta", "Ortalama", "Kayıtlı gün"], minText: 120 })) rec.ok("nutrition/week", "renders");
  await P.locator('[data-testid="nutrition-tabs"] >> text=Gün').click();
  await wait(2000);
  if (await has("nutrition-hero")) rec.ok("nutrition/week", "switches back to the day");
  else rec.fail("nutrition/week", "the day view did not come back");
}

/* ------------------------------------------------------------- the add menu */
{
  h.setWhere("nutrition/add-menu");
  await tap("nutrition-fab");
  await wait(1200);
  const entries = ["add-scan", "add-search", "add-recent", "add-barcode", "add-manual"];
  for (const id of entries) if (!(await has(id))) rec.fail("nutrition/add-menu", `${id} missing`);

  // Each entry has to land on a surface that is still there a second later: the outgoing sheet's
  // late onDismiss used to close the one that had just opened, so every entry looked dead.
  const landings = [
    ["search", "food-search-input"],
    ["recent", "food-results"],
    ["manual", "custom-food-form"],
    ["barcode", "barcode-modal"],
  ];
  for (const [action, landing] of landings) {
    await reloadToNutrition();
    await openAddAction(action);
    await wait(1200); // long enough for a stale dismiss to have fired
    if (await has(landing)) rec.ok("nutrition/add-menu", `add-${action} → ${landing}`);
    else rec.fail("nutrition/add-menu", `add-${action} opened nothing (${landing} never stayed on screen)`);
  }
}

/* -------------------------------------------------------- search → add food */
let addedKcal = 0;
{
  h.setWhere("nutrition/search");
  await reloadToNutrition();
  const before = await heroKcal();
  await openAddAction("search");

  let searchRequests = 0;
  P.on("request", (r) => {
    if (/nutrition\/foods\/search/.test(r.url())) searchRequests++;
  });
  await P.locator('[data-testid="food-search-input"]').type("tavuk", { delay: 60 });
  await wait(2200);
  if (searchRequests === 1) rec.ok("nutrition/search", "debounced: 5 keystrokes → 1 request");
  else rec.fail("nutrition/search", `debounce broken: 5 keystrokes fired ${searchRequests} search requests`);

  const results = (await P.locator('[data-testid^="food-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).filter(
    (t) => t && !["food-search-input", "food-search-clear", "food-results", "food-results-skeleton"].includes(t)
  );
  if (results.length) rec.ok("nutrition/search", `${results.length} results for “tavuk”`);
  else rec.fail("nutrition/search", "searching “tavuk” returned no rows");

  if (await has("food-search-clear")) {
    await tap("food-search-clear");
    await wait(700);
    if ((await P.locator('[data-testid="food-search-input"]').inputValue()) === "") rec.ok("nutrition/search", "clear empties the box");
    else rec.fail("nutrition/search", "the clear button did not empty the search box");
    await P.locator('[data-testid="food-search-input"]').fill("tavuk");
    await wait(2000);
  } else rec.fail("nutrition/search", "no clear button while the box has text");

  // Row → detail: serving chips, the ±10 g stepper and the meal picker all feed the same add.
  await tap(results[0]);
  await wait(1400);
  if (!(await has("search-detail"))) rec.fail("nutrition/search", "tapping a result did not open the food detail");
  const kcal0 = Number((await P.locator('[data-testid="search-detail-kcal"]').innerText()).replace(/\./g, ""));
  await tap("search-detail-grams-inc");
  await wait(500);
  const kcal1 = Number((await P.locator('[data-testid="search-detail-kcal"]').innerText()).replace(/\./g, ""));
  if (kcal1 > kcal0) rec.ok("nutrition/search", `stepper +10 g recalculates (${kcal0} → ${kcal1} kcal)`);
  else rec.fail("nutrition/search", `the grams stepper changed nothing (${kcal0} → ${kcal1})`);
  await tap("search-detail-meal-breakfast");
  await wait(400);
  await tap("search-detail-submit");
  await wait(2600);

  const after = await heroKcal();
  addedKcal = after - before;
  if (after > before) rec.ok("nutrition/search", `adding updated the totals (${before} → ${after} kcal)`);
  else rec.fail("nutrition/search", `adding a food left the totals at ${after} kcal`);
  if (/Kahvaltı/.test(await body()) && (await entryIds()).length > 0) rec.ok("nutrition/search", "the entry is in the meal list");
  else rec.fail("nutrition/search", "the added entry never appeared in a meal section");

  await reloadToNutrition();
  if ((await heroKcal()) === after) rec.ok("nutrition/search", "the entry survives a reload");
  else rec.fail("nutrition/search", `the entry did not persist (after reload: ${await heroKcal()} kcal, expected ${after})`);
}

/* ----------------------------------------------------------- serving chips */
{
  h.setWhere("nutrition/serving-chip");
  const before = await heroKcal();
  await openAddAction("recent");
  await wait(1500);
  const chips = await P.locator('[data-testid^="quick-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  if (!chips.length) rec.fail("nutrition/serving-chip", "no serving quick-add chips on the recents list");
  else {
    await tap(chips[0]);
    await wait(2600);
    const after = await heroKcal();
    if (after > before) rec.ok("nutrition/serving-chip", `quick-add from a serving chip logged it (${before} → ${after} kcal)`);
    else rec.fail("nutrition/serving-chip", `the serving chip added nothing (${before} → ${after} kcal)`);
  }
}

/* --------------------------------------------------------------- edit grams */
{
  h.setWhere("nutrition/grams");
  await reloadToNutrition();
  const [first] = await entryIds();
  if (!first) rec.fail("nutrition/grams", "no logged entry to edit");
  else {
    const before = await heroKcal();
    await tap(first);
    await wait(1400);
    if (!(await has("grams-sheet"))) rec.fail("nutrition/grams", "tapping an entry did not open the grams sheet");
    for (let i = 0; i < 3; i++) {
      await tap("grams-sheet-grams-inc");
      await wait(250);
    }
    await tap("grams-sheet-submit");
    await wait(2600);
    const after = await heroKcal();
    if (after > before) rec.ok("nutrition/grams", `editing grams updated the totals (${before} → ${after} kcal)`);
    else rec.fail("nutrition/grams", `editing grams changed nothing (${before} → ${after} kcal)`);
    await reloadToNutrition();
    if ((await heroKcal()) === after) rec.ok("nutrition/grams", "the new grams persist");
    else rec.fail("nutrition/grams", `the grams edit did not persist (${await heroKcal()} vs ${after})`);
  }
}

/* -------------------------------------------------- swipe to delete + undo */
{
  h.setWhere("nutrition/delete");
  const ids = await entryIds();
  if (ids.length < 1) rec.fail("nutrition/delete", "no logged entry to delete");
  else {
    const id = ids[0];
    await swipeLeft(id);
    if (await has(`entry-delete-${id.slice("entry-".length)}`)) rec.ok("nutrition/delete", "swiping reveals the delete action");
    await tap(`entry-delete-${id.slice("entry-".length)}`);
    await wait(1800);
    if ((await P.locator(`[data-testid="${id}"]`).count()) === 0) rec.ok("nutrition/delete", "the row leaves at once (optimistic)");
    else rec.fail("nutrition/delete", "the deleted row is still on screen");
    if (await has("undo-bar")) rec.ok("nutrition/delete", "the undo bar offers it back");
    else rec.fail("nutrition/delete", "no undo bar after a delete");

    await tap("undo-delete");
    await wait(2600);
    if ((await entryIds()).length === ids.length) rec.ok("nutrition/delete", "undo puts the entry back");
    else rec.fail("nutrition/delete", `undo did not restore the entry (${(await entryIds()).length} of ${ids.length} rows)`);
    await reloadToNutrition();
    if ((await entryIds()).length === ids.length) rec.ok("nutrition/delete", "the restored entry persists");
    else rec.fail("nutrition/delete", "the restored entry vanished after a reload");
  }
}

/* -------------------------------------------------- barcode: web fallback */
{
  h.setWhere("nutrition/barcode");
  await reloadToNutrition();
  await openAddAction("barcode");
  const t = await body();
  if (!(await has("barcode-modal"))) rec.fail("nutrition/barcode", "the barcode screen never opened");
  else if (/Barkod telefonda çalışır/.test(t)) rec.ok("nutrition/barcode", "no camera on web → explained, not crashed");
  else rec.fail("nutrition/barcode", `no camera fallback message: ${t.slice(0, 120).replace(/\n+/g, " | ")}`);
  if (await has("barcode-close")) rec.ok("nutrition/barcode", "closable");
  else rec.fail("nutrition/barcode", "no close button on the barcode screen");

  // Its only way forward on web is "Elle gir", which must land on the manual form.
  await P.locator("text=Elle gir").last().click();
  await wait(1800);
  if (await has("custom-food-form")) rec.ok("nutrition/barcode", "“Elle gir” hands over to the manual form");
  else rec.fail("nutrition/barcode", "“Elle gir” from the barcode screen opened nothing");
}

/* -------------------------------------------- custom food: validate + save */
{
  h.setWhere("nutrition/custom-food");
  const before = await heroKcal();
  await tap("custom-food-continue");
  await wait(600);
  if (/Bir isim yaz/.test(await body())) rec.ok("nutrition/custom-food", "an empty form is refused with a reason");
  else rec.fail("nutrition/custom-food", "the empty custom-food form submitted without complaint");

  await P.locator('[data-testid="custom-name"]').first().fill("E2E kek");
  await wait(300);
  await tap("custom-food-continue");
  await wait(600);
  if (/0–900/.test(await body())) rec.ok("nutrition/custom-food", "a missing calorie value is refused");
  else rec.fail("nutrition/custom-food", "a custom food with no calories was accepted");

  for (const [id, v] of [
    ["custom-kcal", "350"],
    ["custom-protein", "6"],
    ["custom-carbs", "45"],
    ["custom-fat", "15"],
  ]) {
    await P.locator(`[data-testid="${id}"]`).first().fill(v);
  }
  await wait(400);
  await tap("custom-food-continue");
  await wait(1400);
  if (await has("custom-detail")) rec.ok("nutrition/custom-food", "a valid form continues to the grams step");
  else rec.fail("nutrition/custom-food", "a valid custom food did not reach the grams step");
  await tap("custom-detail-submit");
  await wait(2600);
  const after = await heroKcal();
  if (/E2E kek/.test(await body()) && after > before) rec.ok("nutrition/custom-food", `the hand-typed food is logged (${before} → ${after} kcal)`);
  else rec.fail("nutrition/custom-food", `the hand-typed food was not logged (${before} → ${after} kcal)`);
}

/* -------------------------------------------------- target sheet: auto/manual */
{
  h.setWhere("nutrition/target");
  await reloadToNutrition();
  await tap("open-target");
  await wait(1600);
  if (!(await has("target-sheet"))) rec.fail("nutrition/target", "the target sheet did not open");
  if (await has("target-auto-calories")) rec.ok("nutrition/target", "auto mode shows the derived target");
  else rec.fail("nutrition/target", "auto mode shows no derived calories");

  await P.locator('[data-testid="target-mode"] >> text=Elle').click();
  await wait(800);
  if (!(await has("target-calories"))) rec.fail("nutrition/target", "manual mode shows no fields");
  await P.locator('[data-testid="target-calories"]').first().fill("2345");
  await wait(400);
  await tap("target-save");
  await wait(2600);
  if (/2\.345/.test(await body())) rec.ok("nutrition/target", "a manual target is applied");
  else rec.fail("nutrition/target", "the manual target never reached the day view");

  await reloadToNutrition();
  if (/2\.345/.test(await body())) rec.ok("nutrition/target", "the manual target persists");
  else rec.fail("nutrition/target", "the manual target was lost on reload");

  await tap("open-target");
  await wait(1600);
  await P.locator('[data-testid="target-mode"] >> text=Otomatik').click();
  await wait(700);
  await tap("target-save");
  await wait(2600);
  if (!/2\.345/.test(await body())) rec.ok("nutrition/target", "switching back to auto restores the derived target");
  else rec.fail("nutrition/target", "auto mode did not replace the manual target");
}

/* ------------------------------------------------------ AI scan (VISION_MOCK) */
{
  h.setWhere("nutrition/scan");
  await reloadToNutrition();
  const before = await heroKcal();
  await openAddAction("scan");

  if (!(await has("scan-camera"))) rec.fail("nutrition/scan", "the scan screen did not open");
  const t = await body();
  if (/Kamera burada yok/.test(t) && (await has("scan-gallery-primary"))) rec.ok("nutrition/scan", "no camera on web → the gallery fallback is offered");
  else rec.fail("nutrition/scan", `no camera fallback on the scan screen: ${t.slice(0, 120).replace(/\n+/g, " | ")}`);

  // The gallery path posts to the real /nutrition/scan, which answers mock detections.
  const [chooser] = await Promise.all([P.waitForEvent("filechooser", { timeout: 15_000 }), tap("scan-gallery-primary")]);
  await chooser.setFiles(PHOTO);

  await wait(600);
  if (await has("ai-thinking")) rec.ok("nutrition/scan", "the AI overlay plays while the photo is analysed");
  else rec.fail("nutrition/scan", "the “AI is thinking” overlay never appeared");
  const label = (await body()).includes("analiz ediliyor") || (await body()).includes("tanınıyor") || (await body()).includes("hesaplanıyor");
  if (label) rec.ok("nutrition/scan", "the overlay steps through its status labels");
  else rec.fail("nutrition/scan", "the overlay shows no status label");

  await wait(4000);
  if (await has("scan-results")) rec.ok("nutrition/scan", "the results sheet lists what the model saw");
  else rec.fail("nutrition/scan", `the scan produced no results sheet (not-food card: ${await has("scan-not-food")})`);

  const cards = await P.locator('[data-testid^="detection-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")).filter((t) => t && !t.includes("-remove-") && !t.includes("-grams-") && !t.includes("-kcal-")));
  if (cards.length) rec.ok("nutrition/scan", `${cards.length} detections, each editable`);
  else rec.fail("nutrition/scan", "the results sheet has no detection cards");

  const key = cards[0]?.slice("detection-".length);
  if (key) {
    const k0 = await P.locator(`[data-testid="detection-kcal-${key}"]`).innerText();
    await tap(`detection-grams-${key}-inc`);
    await wait(500);
    const k1 = await P.locator(`[data-testid="detection-kcal-${key}"]`).innerText();
    if (k0 !== k1) rec.ok("nutrition/scan", `a detection's grams recalculate (${k0} → ${k1})`);
    else rec.fail("nutrition/scan", "the detection stepper changed nothing");
    await tap(`detection-remove-${key}`);
    await wait(700);
    if ((await P.locator(`[data-testid="detection-${key}"]`).count()) === 0) rec.ok("nutrition/scan", "a detection can be dropped");
    else rec.fail("nutrition/scan", "removing a detection left it on the sheet");
  }

  // "Başka bir yemek ekle" used to stack a second bottom sheet, and gorhom could not bring the
  // minimised results sheet back on web: the user landed on a bare photo with the scan lost.
  if (await has("scan-add-more")) {
    await tap("scan-add-more");
    await wait(2000);
    if (await has("food-search-input")) rec.ok("nutrition/scan", "“Başka bir yemek ekle” opens the search");
    else rec.fail("nutrition/scan", "“Başka bir yemek ekle” opened nothing");
    await P.locator('[data-testid="food-search-input"]').fill("elma");
    await wait(2200);
    const more = (await P.locator('[data-testid^="food-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).filter(
      (t) => t && !["food-search-input", "food-search-clear", "food-results", "food-results-skeleton"].includes(t)
    );
    if (more.length) {
      await tap(more[0]);
      await wait(1400);
      await tap("search-detail-submit");
      await wait(2400);
      if (await has("scan-results")) rec.ok("nutrition/scan", "the results sheet comes back with the extra food");
      else rec.fail("nutrition/scan", "adding a food from the scan search threw the results sheet away");
    } else rec.fail("nutrition/scan", "no results while adding another food to the scan");
  }

  await tap("scan-meal-lunch");
  await wait(400);
  await tap("scan-save");
  await wait(4500);
  const after = await heroKcal();
  if (after > before) rec.ok("nutrition/scan", `the scan lands in the day log (${before} → ${after} kcal)`);
  else rec.fail("nutrition/scan", `saving the scan changed nothing (${before} → ${after} kcal)`);
  await reloadToNutrition();
  if ((await heroKcal()) === after) rec.ok("nutrition/scan", "the scanned meal persists");
  else rec.fail("nutrition/scan", `the scanned meal did not persist (${await heroKcal()} vs ${after})`);
}

/* ---------------------------------------------------------- nothing overlaps */
{
  h.setWhere("nutrition/final");
  if (await assertScreenHealthy(h, rec, "nutrition/final", { needles: ["Beslenme"], minText: 200 })) rec.ok("nutrition/final", "the day view is still healthy after the whole run");
}

await h.close();
process.exit(rec.summary("mobile nutrition e2e") === 0 ? 0 : 1);
