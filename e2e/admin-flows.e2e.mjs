/**
 * Admin panel behaviour, driven like a user.
 *
 * `admin.e2e.mjs` proves every route *renders*. This file proves the buttons on those routes
 * actually do something: it fills forms, submits them, reloads and checks the server kept the
 * change. Every assertion here maps to a defect that the jsdom unit tests were blind to —
 * a form that submits natively before hydration, a redirect that forgets where you were going,
 * a list that stops at the first page, a switch whose value is thrown away on save.
 *
 * Usage: ADMIN_URL=http://127.0.0.1:3000 node e2e/admin-flows.e2e.mjs
 */
import { ADMIN_URL, USER, createRecorder, open } from "./lib/browser.mjs";

const rec = createRecorder();
const h = await open({ rec, viewport: { width: 1440, height: 1000 } });
const p = h.page;

const SUFFIX = Date.now().toString().slice(-6);
const TEST_USER = `a1e2e${SUFFIX}`;

const check = (where, what, ok) => (ok ? rec.ok(where, what) : rec.fail(where, what));

/** Settles the react-query refetch that follows a mutation. */
const settle = (ms = 1600) => p.waitForTimeout(ms);

const goto = async (route, where) => {
  h.setWhere(where);
  await p.goto(`${ADMIN_URL}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
  await settle(1200);
};

/* ---------------------------------------------------------------- login --- */

/**
 * The failure cases below deliberately produce a 401 and a wall of blocked-script errors, so
 * they run on their own page: the recorder attached to `p` would report that noise as defects.
 */
async function inScratchPage(fn) {
  const ctx = await h.browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  try {
    await fn(page);
  } finally {
    await ctx.close();
  }
}

await inScratchPage(async (page) => {
  // With no JS the form must not fall back to a native GET submit, which would put the
  // plaintext password in the URL, in history, in the referrer and in every access log.
  await page.route("**/*.js", (r) => r.abort());
  await page.goto(`${ADMIN_URL}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1500);
  check("login/before-hydration", "submit button is inert until React hydrates", await page.locator('button[type="submit"]').isDisabled());
  await page.fill('input[name="username"]', USER.username);
  await page.fill('input[name="password"]', USER.password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForTimeout(1500);
  check("login/before-hydration", "Enter does not submit the password into the URL", !/password=/.test(page.url()));
});

await inScratchPage(async (page) => {
  await page.goto(`${ADMIN_URL}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.fill('input[name="username"]', USER.username);
  await page.fill('input[name="password"]', "definitely-not-the-password");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);
  const body = await page.locator("body").innerText();
  check("login/bad-password", "a wrong password shows an error and stays put", /Giriş yapılamadı/.test(body) && page.url().includes("/login"));
});

{
  h.setWhere("login/deep-link");
  // A protected deep link must come back to you after signing in, not dump you on the dashboard.
  await p.goto(`${ADMIN_URL}/programs`, { waitUntil: "networkidle", timeout: 60_000 });
  check("login/deep-link", "guard redirects with ?next=", p.url().includes("next=%2Fprograms"));

  await p.fill('input[name="username"]', USER.username);
  await p.fill('input[name="password"]', USER.password);
  await p.locator('button[type="submit"]').click();
  await p.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25_000 }).catch(() => {});
  await settle(2000);
  check("login/deep-link", "signing in lands on the requested page", p.url().endsWith("/programs"));
}

/* ---------------------------------------------------------------- users --- */

{
  await goto("/users", "users/create");
  await p.getByRole("button", { name: "Yeni kullanıcı" }).first().click();
  await settle(800);
  const drawer = p.locator('[role="dialog"]');
  check("users/create", "the create drawer opens", await drawer.isVisible());
  // The drawer must not offer settings this endpoint cannot store (mascotEnabled is not part
  // of zAdminCreateUserInput, so a switch for it would silently discard the value).
  check("users/create", "no control the save cannot persist", !(await drawer.innerText()).includes("Floo mesajları"));

  await drawer.locator("input[data-autofocus]").fill("A1 E2E Kullanıcı");
  const fields = drawer.locator("form input");
  await fields.nth(1).fill(TEST_USER);
  await fields.nth(2).fill("Asd*123");
  await p.getByRole("button", { name: "Oluştur" }).click();
  await settle(2500);
  check("users/create", "the new user appears in the table", (await h.text()).includes("A1 E2E Kullanıcı"));

  h.setWhere("users/edit");
  await p.getByRole("button", { name: "A1 E2E Kullanıcı düzenle" }).click();
  await settle(800);
  await p.locator('[role="dialog"] input[data-autofocus]').fill("A1 E2E Düzenli");
  await p.getByRole("button", { name: "Kaydet" }).click();
  await settle(2200);
  await p.reload({ waitUntil: "networkidle" });
  await settle(1500);
  check("users/edit", "the rename survives a reload", (await h.text()).includes("A1 E2E Düzenli"));

  h.setWhere("users/reset-password");
  await p.getByRole("button", { name: "A1 E2E Düzenli parolasını sıfırla" }).click();
  await settle(700);
  await p.locator('[role="dialog"] input[type="password"]').fill("Qwe*456");
  await p.getByRole("button", { name: "Parolayı değiştir" }).click();
  await settle(2200);
  check("users/reset-password", "the dialog closes on success", !(await p.locator('[role="dialog"]').isVisible().catch(() => false)));

  h.setWhere("users/assign-program");
  await p.getByRole("button", { name: "A1 E2E Düzenli için program ata" }).click();
  await settle(900);
  await p.getByRole("button", { name: "Ata", exact: true }).click();
  await settle(2200);
  await p.reload({ waitUntil: "networkidle" });
  await settle(1500);
  const row = await p.locator("tr", { hasText: "A1 E2E Düzenli" }).innerText();
  check("users/assign-program", "the row now shows an assigned program", row.includes("Atanmış"));

  h.setWhere("users/login-as-new");
  // The account must really exist with the password we just set — and a non-admin must be
  // refused by the panel rather than half-let in.
  const ctx = await h.browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const p2 = await ctx.newPage();
  await p2.goto(`${ADMIN_URL}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  await p2.fill('input[name="username"]', TEST_USER);
  await p2.fill('input[name="password"]', "Qwe*456");
  await p2.locator('button[type="submit"]').click();
  await p2.waitForTimeout(3000);
  check("users/login-as-new", "the new account authenticates and is told it lacks panel access", p2.url().includes("forbidden=1"));
  await ctx.close();

  h.setWhere("users/delete");
  await p.getByRole("button", { name: "A1 E2E Düzenli sil" }).click();
  await settle(700);
  await p.getByRole("button", { name: "Sil", exact: true }).click();
  await settle(2200);
  check("users/delete", "the user is gone after confirming", !(await h.text()).includes("A1 E2E Düzenli"));

  h.setWhere("users/search");
  await p.fill('input[placeholder*="Ad veya"]', "eren");
  await settle(1600);
  check("users/search", "search filters the table", (await h.text()).includes("@eren") && !(await h.text()).includes("@inci"));

  h.setWhere("users/detail");
  await p.fill('input[placeholder*="Ad veya"]', "");
  await settle(1500);
  await p.locator('tbody a[href^="/users/"]').first().click();
  await p.waitForURL(/\/users\/[^/]+$/, { timeout: 20_000 }).catch(() => {});
  await settle(2000);
  const detail = await h.text();
  check("users/detail", "the detail page opens with the user's panels", /Rapor özeti/.test(detail) && /Son antrenmanlar/.test(detail));
  await p.getByRole("link", { name: /Listeye dön/ }).click();
  await settle(1800);
  check("users/detail", "“Listeye dön” goes back to the list", p.url().endsWith("/users"));
}

/* -------------------------------------------------------------- muscles --- */

{
  await goto("/muscles", "muscles/reorder");
  const rows = () => p.locator("main li.list-none").evaluateAll((els) => els.map((e) => e.innerText.split("\n")[0]));
  const before = await rows();
  const second = before[1];

  // The drag handle is focusable, so it has to work from the keyboard too.
  await p.locator('main button[aria-label*="sırasını değiştir"]').nth(1).focus();
  await p.keyboard.press("ArrowUp");
  await settle(1800);
  await p.reload({ waitUntil: "networkidle" });
  await settle(1600);
  const after = await rows();
  check("muscles/reorder", "keyboard reorder persists to the server", after[0] === second);

  await p.locator('main button[aria-label*="sırasını değiştir"]').first().focus();
  await p.keyboard.press("ArrowDown");
  await settle(1800);

  h.setWhere("muscles/inline-edit");
  const target = (await rows())[0];
  await p.getByRole("button", { name: new RegExp(`${target} tam yenilenme süresi`) }).click();
  await settle(300);
  const hours = p.locator('input[aria-label*="tam yenilenme"]');
  const original = await hours.inputValue();
  await hours.fill("37");
  await p.keyboard.press("Enter");
  await settle(1800);
  await p.reload({ waitUntil: "networkidle" });
  await settle(1600);
  check("muscles/inline-edit", "an inline number edit survives a reload", /37\s*sa/.test(await h.text()));
  await p.getByRole("button", { name: new RegExp(`${target} tam yenilenme süresi`) }).click();
  await settle(300);
  await p.locator('input[aria-label*="tam yenilenme"]').fill(original);
  await p.keyboard.press("Enter");
  await settle(1600);

  h.setWhere("muscles/active");
  const sw = p.locator(`[aria-label="${target} aktif"]`).first();
  await sw.click();
  await settle(1600);
  await p.reload({ waitUntil: "networkidle" });
  await settle(1600);
  check("muscles/active", "the active toggle persists", (await p.locator(`[aria-label="${target} aktif"]`).first().getAttribute("aria-checked")) === "false");
  await p.locator(`[aria-label="${target} aktif"]`).first().click();
  await settle(1600);

  h.setWhere("muscles/curve");
  await p.getByRole("button", { name: /Yenilenme eğrisini göster/ }).first().click();
  await settle(1400);
  check("muscles/curve", "the recovery curve renders", (await p.locator("svg.recharts-surface").count()) > 0);
  // A negative chart margin used to pull "%100" off the left edge of the SVG, which clips it.
  // Playwright reports no innerText for SVG <text>, so this measures geometry instead.
  const overflow = await p.evaluate(() =>
    [...document.querySelectorAll("svg.recharts-surface")].flatMap((svg) => {
      const box = svg.getBoundingClientRect();
      return [...svg.querySelectorAll("text")]
        .map((t) => ({ text: t.textContent, over: box.left - t.getBoundingClientRect().left }))
        .filter((t) => t.over > 0.5);
    })
  );
  check("muscles/curve", `y-axis labels are not clipped (${JSON.stringify(overflow)})`, overflow.length === 0);

  h.setWhere("muscles/delete-guard");
  await p.getByRole("button", { name: new RegExp(`${target} sil`) }).click();
  await settle(700);
  check("muscles/delete-guard", "delete asks for confirmation", await p.locator('[role="dialog"]').isVisible());
  await p.getByRole("button", { name: "Vazgeç" }).click();
  await settle(600);
  check("muscles/delete-guard", "cancelling keeps the muscle", (await h.text()).includes(target));
}

/* ------------------------------------------------------------ exercises --- */

{
  await goto("/exercises", "exercises/filter");
  const rowCount = () => p.locator("tbody tr").count();
  const all = await rowCount();
  await p.fill('input[placeholder*="Hareket veya"]', "squat");
  await settle(1700);
  const searched = await rowCount();
  check("exercises/filter", "search narrows the table", searched > 0 && searched < all);
  await p.fill('input[placeholder*="Hareket veya"]', "");
  await settle(1500);
  await p.selectOption('select[aria-label="Kasa göre filtrele"]', { index: 1 });
  await settle(1700);
  const filtered = await rowCount();
  check("exercises/filter", "the muscle filter narrows the table", filtered > 0 && filtered < all);
  await p.selectOption('select[aria-label="Kasa göre filtrele"]', "");
  await settle(1500);

  h.setWhere("exercises/create");
  await p.getByRole("button", { name: "Yeni hareket" }).first().click();
  await settle(900);
  const dialog = p.locator('[role="dialog"]');
  await dialog.locator("input[data-autofocus]").fill("A1 E2E Hareket");
  const slider = dialog.locator('input[type="range"]').first();
  await slider.focus();
  for (let i = 0; i < 10; i++) await p.keyboard.press("ArrowRight");
  check("exercises/create", "the load slider responds to the keyboard", Number(await slider.inputValue()) > 0);
  await p.getByRole("button", { name: "Ekle" }).click();
  await settle(2400);
  await p.reload({ waitUntil: "networkidle" });
  await settle(1600);
  check("exercises/create", "the new exercise is stored", (await h.text()).includes("A1 E2E Hareket"));

  h.setWhere("exercises/delete");
  await p.getByRole("button", { name: "A1 E2E Hareket sil" }).click();
  await settle(700);
  await p.getByRole("button", { name: "Sil", exact: true }).click();
  await settle(2200);
  check("exercises/delete", "the exercise is removed", !(await h.text()).includes("A1 E2E Hareket"));
}

/* ---------------------------------------------------- program templates --- */

{
  await goto("/programs", "programs/builder");
  const href = await p.locator('a[href^="/programs/"]').first().getAttribute("href");
  await goto(href, "programs/builder");
  await settle(1500);

  const totalSets = async () => {
    const t = await p.locator("main").innerText();
    return Number(t.match(/toplam (\d+) planlı set/)?.[1] ?? -1);
  };
  const dayTitles = () => p.locator('section[aria-label*=". gün"] header').evaluateAll((els) => els.map((e) => e.innerText.split("\n")[1]));
  const dayExercises = () => p.locator('section[aria-label*="1. gün"] li').evaluateAll((els) => els.map((e) => e.innerText.split("\n")[0]));

  // Days live in a horizontal scroller — every day of the cycle must be reachable, not just
  // the three that happen to fit.
  const scroller = p.locator(".ff-scroll-x").first();
  const geometry = await scroller.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  const columns = await p.locator('section[aria-label*=". gün"]').count();
  check("programs/builder", `all ${columns} day columns are reachable by scrolling`, geometry.scroll > geometry.client && columns >= 4);

  const baseline = await totalSets();
  const firstSets = p.locator('section[aria-label*="1. gün"] button[aria-label*="set sayısı"]').first();
  const label = await firstSets.getAttribute("aria-label");
  const exercise = label.replace(/ set sayısı.*/, "");
  const current = Number(label.match(/: (\d+)\./)[1]);
  await firstSets.click();
  await settle(300);
  await p.locator(`input[aria-label="${exercise} set sayısı"]`).fill(String(current + 3));
  await p.keyboard.press("Enter");
  await settle(900);
  check("programs/builder", "the volume matrix recomputes live", (await totalSets()) === baseline + 3);
  check("programs/builder", "the unsaved-changes banner appears", (await h.text()).includes("Kaydedilmemiş değişiklikler"));

  h.setWhere("programs/move");
  const movable = await p.locator('section[aria-label*="1. gün"] button[aria-label*="sonraki güne taşı"]').first().getAttribute("aria-label");
  const moved = movable.replace(/ sonraki güne taşı/, "");
  await p.locator(`section[aria-label*="1. gün"] button[aria-label="${movable}"]`).click();
  await settle(700);
  check("programs/move", "an exercise moves to the next day", !(await dayExercises()).includes(moved));

  h.setWhere("programs/reorder-days");
  const titlesBefore = await dayTitles();
  await p.getByRole("button", { name: "Günü sola taşı" }).nth(1).click();
  await settle(700);
  const titlesAfter = await dayTitles();
  check("programs/reorder-days", "days swap places", titlesAfter[0] === titlesBefore[1]);

  h.setWhere("programs/picker");
  await p.locator('section[aria-label*="1. gün"] button:has-text("Hareket ekle")').click();
  await settle(1000);
  check("programs/picker", "the exercise picker opens", await p.locator('[role="dialog"]').isVisible());
  const pick = p.locator('[role="dialog"] button').nth(1);
  const picked = (await pick.innerText()).split("\n")[0];
  await pick.click();
  await settle(700);
  await p.keyboard.press("Escape");
  await settle(500);
  check("programs/picker", "the picked exercise lands in the day", (await dayExercises()).includes(picked));

  h.setWhere("programs/save");
  await p.getByRole("button", { name: /^Kaydet$/ }).first().click();
  await settle(2600);
  const savedTotal = await totalSets();
  const savedTitles = await dayTitles();
  const savedDay1 = await dayExercises();
  await p.reload({ waitUntil: "networkidle" });
  await settle(2000);
  check(
    "programs/save",
    "the whole draft survives a reload",
    (await totalSets()) === savedTotal &&
      (await dayTitles()).join("|") === savedTitles.join("|") &&
      (await dayExercises()).join("|") === savedDay1.join("|")
  );
  check("programs/save", "the unsaved banner clears after saving", !(await h.text()).includes("Kaydedilmemiş değişiklikler"));

  h.setWhere("programs/guard");
  await p.locator('section[aria-label*="1. gün"] button[aria-label*="set sayısı"]').first().click();
  await settle(300);
  await p.keyboard.press("Enter");
  await p.locator('section[aria-label*="1. gün"] button[aria-label*="tekrar sayısı"]').first().click();
  await settle(300);
  const repsLabel = await p.locator('input[aria-label*="tekrar sayısı"]').getAttribute("aria-label");
  await p.locator(`input[aria-label="${repsLabel}"]`).fill("11");
  await p.keyboard.press("Enter");
  await settle(800);
  await p.getByRole("button", { name: /Listeye dön/ }).click();
  await settle(900);
  check("programs/guard", "leaving with unsaved changes is guarded", await p.locator('[role="dialog"]').isVisible().catch(() => false));
  await p.getByRole("button", { name: "Vazgeç" }).click();
  await settle(600);
  await p.getByRole("button", { name: "Geri al" }).click();
  await settle(700);
  check("programs/guard", "“Geri al” drops the draft", !(await h.text()).includes("Kaydedilmemiş değişiklikler"));

  h.setWhere("programs/duplicate");
  const listBefore = await (async () => {
    await goto("/programs", "programs/duplicate");
    return p.locator('a[href^="/programs/"]').count();
  })();
  await goto(href, "programs/duplicate");
  await p.getByRole("button", { name: "Kopyala" }).click();
  await settle(2600);
  await goto("/programs", "programs/duplicate");
  check("programs/duplicate", "a copy shows up in the list", (await p.locator('a[href^="/programs/"]').count()) > listBefore);
}

/* ------------------------------------------------------- goal settings ---- */

{
  await goto("/goals-settings", "goals/simulator");
  const dailyKcal = async () => {
    const lines = (await p.locator("main").innerText()).split("\n").map((s) => s.trim());
    const start = lines.findIndex((l) => /GÜNLÜK KALOR/i.test(l));
    return lines.slice(start + 1).find(Boolean);
  };
  const original = await dailyKcal();
  await p.locator('input[aria-label="Kilo"]').fill("120");
  await settle(1100);
  check("goals/simulator", "the plan recomputes when an input changes", (await dailyKcal()) !== original);
  await p.locator('input[aria-label="Kilo"]').fill("103");
  await settle(900);

  h.setWhere("goals/rate-table");
  await p.getByRole("radio", { name: "Oran tablosu" }).click();
  await settle(900);
  const bands = await p.locator("tbody tr").count();
  await p.getByRole("button", { name: "Bant ekle" }).click();
  await settle(800);
  check("goals/rate-table", "a band can be added", (await p.locator("tbody tr").count()) === bands + 1);
  const problems = await p.locator('[data-testid="rate-table-problems"] li').allInnerTexts();
  check("goals/rate-table", "an overlapping band is reported", problems.length > 0);
  check("goals/rate-table", "saving is blocked while the table is invalid", !(await p.getByRole("button", { name: /Kaydet/ }).isEnabled()));
  await p.locator("tbody tr").last().locator("button").last().click();
  await settle(800);
  check("goals/rate-table", "removing the band clears the problem", (await p.locator('[data-testid="rate-table-problems"] li').count()) === 0);

  h.setWhere("goals/save");
  await p.getByRole("radio", { name: "Sabitler" }).click();
  await settle(700);
  const constant = p.locator('input[aria-label="Alpert güvenlik payı"]');
  const before = await constant.inputValue();
  await constant.fill("0.82");
  await settle(900);
  await p.getByRole("button", { name: /Kaydet/ }).click();
  await settle(2400);
  await p.reload({ waitUntil: "networkidle" });
  await settle(2000);
  check("goals/save", "a changed constant survives a reload", (await p.locator('input[aria-label="Alpert güvenlik payı"]').inputValue()) === "0.82");
  await p.locator('input[aria-label="Alpert güvenlik payı"]').fill(before);
  await settle(700);
  await p.getByRole("button", { name: /Kaydet/ }).click();
  await settle(2200);
}

/* -------------------------------------------------------------- mascot ---- */

{
  await goto("/mascot", "mascot/edit");
  await p.locator('button:has-text("workoutDue")').first().click();
  await settle(800);
  const variants = () => p.locator("textarea").evaluateAll((els) => els.map((t) => t.value));
  const count = (await variants()).length;
  await p.getByRole("button", { name: /Varyant ekle/ }).click();
  await settle(600);
  await p.locator("textarea").last().fill("A1 e2e varyantı");
  await p.getByRole("button", { name: /Kaydet/ }).first().click();
  await settle(2400);
  await p.reload({ waitUntil: "networkidle" });
  await settle(1600);
  await p.locator('button:has-text("workoutDue")').first().click();
  await settle(800);
  const saved = await variants();
  check("mascot/edit", "an added variant is stored", saved.length === count + 1 && saved.includes("A1 e2e varyantı"));

  h.setWhere("mascot/reset");
  await p.getByRole("button", { name: "Varsayılanlara dön" }).click();
  await settle(700);
  await p.getByRole("button", { name: /Varsayılan/ }).last().click();
  await settle(2600);
  await p.locator('button:has-text("workoutDue")').first().click();
  await settle(900);
  check("mascot/reset", "reset restores the shipped catalogue", !(await variants()).includes("A1 e2e varyantı"));
}

/* --------------------------------------------------------------- foods ---- */

{
  await goto("/foods", "foods/list");
  const rowCount = () => p.locator("tbody tr").count();
  const firstPage = await rowCount();
  // 417 foods behind a 50-row list used to be a dead end: no pager, no way forward.
  if ((await h.text()).includes("toplam")) {
    await p.getByRole("button", { name: "Daha fazla göster" }).click();
    await settle(2000);
    check("foods/list", "the list can be extended past the first page", (await rowCount()) > firstPage);
  }

  h.setWhere("foods/inline-edit");
  const kcal = p.locator("tbody tr").first().locator('button[aria-label*="kalorisi"]');
  const original = (await kcal.innerText()).trim();
  await kcal.click();
  await settle(300);
  await p.locator('input[aria-label*="kalorisi"]').fill("123");
  await p.keyboard.press("Enter");
  await settle(2000);
  await p.reload({ waitUntil: "networkidle" });
  await settle(1800);
  const edited = (await p.locator("tbody tr").first().locator('button[aria-label*="kalorisi"]').innerText()).trim();
  check("foods/inline-edit", "a per-100g edit survives a reload", edited === "123");
  await p.locator("tbody tr").first().locator('button[aria-label*="kalorisi"]').click();
  await settle(300);
  await p.locator('input[aria-label*="kalorisi"]').fill(original);
  await p.keyboard.press("Enter");
  await settle(1800);

  h.setWhere("foods/create");
  await p.getByRole("button", { name: "Yeni besin" }).first().click();
  await settle(900);
  const dialog = p.locator('[role="dialog"]');
  await dialog.locator("input[data-autofocus]").fill("A1 E2E Besin");
  const numbers = dialog.locator('input[type="number"]');
  await numbers.nth(0).fill("200");
  await numbers.nth(1).fill("20");
  await numbers.nth(2).fill("10");
  await numbers.nth(3).fill("10");
  await p.getByRole("button", { name: "Ekle" }).click();
  await settle(2400);
  await p.fill('input[placeholder*="Besin"]', "A1 E2E Besin");
  await settle(1800);
  check("foods/create", "the new food is searchable", (await h.text()).includes("A1 E2E Besin"));

  h.setWhere("foods/delete");
  await p.getByRole("button", { name: /A1 E2E Besin sil/ }).click();
  await settle(700);
  await p.getByRole("button", { name: "Sil", exact: true }).click();
  await settle(2200);
  check("foods/delete", "the food is removed", !(await h.text()).includes("A1 E2E Besin"));
  await p.fill('input[placeholder*="Besin"]', "");
  await settle(1400);

  h.setWhere("foods/import");
  await p.getByRole("button", { name: "İçe aktar" }).first().click();
  await settle(900);
  await p.locator('[role="dialog"] button:has-text("İçe aktar")').click();
  await settle(800);
  check("foods/import", "an empty query is rejected", (await p.locator('[role="dialog"]').innerText()).includes("Aranacak bir terim gir"));
  await p.locator('[role="dialog"] [aria-label="Kapat"]').click();
  await settle(600);
}

/* ------------------------------------------------ settings & app chrome --- */

{
  await goto("/settings", "settings/save");
  const mascotName = p.locator("main input:not([type])").first();
  const original = await mascotName.inputValue();
  await mascotName.fill("A1Floo");
  await settle(600);
  await p.getByRole("button", { name: /^Kaydet$/ }).click();
  await settle(2400);
  await p.reload({ waitUntil: "networkidle" });
  await settle(1600);
  check("settings/save", "a settings change survives a reload", (await p.locator("main input:not([type])").first().inputValue()) === "A1Floo");
  await p.locator("main input:not([type])").first().fill(original);
  await p.getByRole("button", { name: /^Kaydet$/ }).click();
  await settle(2200);

  h.setWhere("settings/password");
  const passwords = p.locator('main input[type="password"]');
  await passwords.nth(0).fill(USER.password);
  await passwords.nth(1).fill("Yeni*1234");
  await passwords.nth(2).fill("Baska*1234");
  await p.getByRole("button", { name: /Parolayı değiştir/ }).click();
  await settle(1400);
  check("settings/password", "mismatched confirmations are refused", /eşleşmiyor|aynı/.test(await h.text()));
}

{
  await goto("/", "chrome/palette");
  await p.keyboard.press("Control+k");
  await settle(700);
  check("chrome/palette", "⌘K opens the palette", await p.locator('[role="dialog"]').isVisible().catch(() => false));
  await p.keyboard.type("kas");
  await settle(700);
  await p.keyboard.press("Enter");
  await settle(1800);
  check("chrome/palette", "Enter navigates to the match", p.url().endsWith("/muscles"));
  await p.locator('header button:has-text("Ara")').click();
  await settle(700);
  await p.keyboard.press("Escape");
  await settle(600);
  check("chrome/palette", "Escape closes it", !(await p.locator('[role="dialog"]').isVisible().catch(() => false)));

  h.setWhere("chrome/theme");
  await p.locator('header button[aria-label^="Tema"]').click();
  await settle(600);
  await p.getByRole("menuitemradio", { name: "Koyu" }).click();
  await settle(900);
  check("chrome/theme", "dark mode applies", (await p.locator("html").getAttribute("class")).includes("dark"));
  await p.reload({ waitUntil: "networkidle" });
  await settle(1400);
  check("chrome/theme", "the choice is remembered", (await p.locator("html").getAttribute("class")).includes("dark"));
  await p.locator('header button[aria-label^="Tema"]').click();
  await settle(600);
  await p.getByRole("menuitemradio", { name: "Açık" }).click();
  await settle(800);

  h.setWhere("chrome/sidebar");
  const navWidth = async () => (await p.locator("nav[aria-label='Ana gezinme']").boundingBox()).width;
  const wide = await navWidth();
  await p.getByRole("button", { name: "Kenar çubuğunu daralt" }).click();
  await settle(800);
  const narrow = await navWidth();
  await p.reload({ waitUntil: "networkidle" });
  await settle(1400);
  check("chrome/sidebar", "collapse works and is remembered", narrow < wide && (await navWidth()) === narrow);
  await p.getByRole("button", { name: "Kenar çubuğunu genişlet" }).click();
  await settle(800);
}

{
  // A phone-width page must never scroll sideways; wide tables scroll inside their own box.
  h.setWhere("chrome/responsive");
  await p.setViewportSize({ width: 400, height: 900 });
  for (const route of ["/", "/users", "/muscles", "/exercises", "/programs", "/goals-settings", "/mascot", "/foods", "/scans", "/settings"]) {
    await goto(route, "chrome/responsive");
    const box = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    check("chrome/responsive", `${route} does not scroll sideways at 400px`, box.scroll <= box.client + 1);
  }
  await p.setViewportSize({ width: 1440, height: 1000 });
}

{
  h.setWhere("chrome/logout");
  await goto("/", "chrome/logout");
  await p.locator('button[aria-label*="hesap menüsü"]').click();
  await settle(600);
  await p.locator('button[role="menuitem"]:has-text("Çıkış yap")').click();
  await settle(2600);
  check("chrome/logout", "logging out returns to /login", p.url().includes("/login"));
  await p.goto(`${ADMIN_URL}/users`, { waitUntil: "networkidle", timeout: 60_000 });
  check("chrome/logout", "the session is really gone", p.url().includes("/login"));
}

await h.close();
process.exit(rec.summary("admin flows") === 0 ? 0 : 1);
