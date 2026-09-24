/**
 * Exercise activation editing, end to end against a real API.
 *
 * The seed catalog (activation data v1, 143 exercises) must reach the admin panel, the literature
 * value, confidence and sources of a pair must be readable next to its editable load, and an edited
 * load must survive a reload — then the literature values must be restorable in one click.
 *
 * Usage: ADMIN_URL=http://127.0.0.1:3000 node e2e/admin-activation.e2e.mjs
 * Optional: E2E_COLOR_SCHEME=dark, E2E_SHOTS=<dir> (writes screenshots of each step).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_URL, createRecorder, loginAdmin, open } from "./lib/browser.mjs";

const SCHEME = process.env.E2E_COLOR_SCHEME === "dark" ? "dark" : "light";
const SHOTS = process.env.E2E_SHOTS ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const rec = createRecorder();
const h = await open({ rec, viewport: { width: 1440, height: 1000 }, context: { colorScheme: SCHEME, reducedMotion: "reduce" } });
const p = h.page;
const check = (where, what, ok) => (ok ? rec.ok(where, what) : rec.fail(where, what));
const shot = async (name, target = p) => {
  if (SHOTS) await target.screenshot({ path: join(SHOTS, `admin-${name}-${SCHEME}.png`) });
};
const NAME = "Barbell Bench Press";

/** The admin API through the panel's own session cookie (same origin, rewritten to the API). */
const api = (path) => p.evaluate(async (url) => (await fetch(url, { credentials: "include" })).json(), `/api/v1${path}`);

async function openDialog() {
  await p.getByRole("button", { name: `${NAME} düzenle`, exact: true }).click();
  const dialog = p.getByRole("dialog", { name: /hareketi düzenle/i });
  await dialog.waitFor({ timeout: 10_000 });
  await dialog.getByRole("button", { name: /literatür değeri/i }).first().waitFor({ timeout: 10_000 });
  return dialog;
}

try {
  if (!(await loginAdmin(h, rec))) throw new Error("login failed");

  h.setWhere("exercises/list");
  await p.goto(`${ADMIN_URL}/exercises`, { waitUntil: "networkidle", timeout: 60_000 });
  await p.getByText(NAME, { exact: true }).first().waitFor({ timeout: 20_000 });
  const listed = (await api("/admin/exercises")).exercises;
  check("exercises/list", `the seed catalog reaches the panel (${listed.length} exercises)`, listed.length >= 143);
  check("exercises/list", "no exercise uses the retired `legs` key", listed.every((e) => e.muscles.every((m) => m.key !== "legs")));
  check("exercises/list", "loads are fractional", listed.some((e) => e.muscles.some((m) => m.load > 0 && m.load < 1)));
  const bench = listed.find((e) => e.name === NAME);
  const row = p.getByRole("row").filter({ hasText: NAME }).first();
  check("exercises/list", "the table shows two-decimal loads (0,95)", (await row.innerText()).includes("0,95"));
  await shot("exercises-list");

  h.setWhere("exercises/dialog");
  let dialog = await openDialog();
  const chest = dialog.getByRole("textbox", { name: "Göğüs yükü (sayı)" });
  check("exercises/dialog", "chest load starts at the literature value", (await chest.inputValue()) === "0,95");
  const chip = dialog.getByRole("button", { name: /literatür değeri.*0,95/i }).first();
  await chip.click();
  const sources = dialog.getByRole("list", { name: "Göğüs kaynakları" });
  const links = await sources.getByRole("link").count();
  check("exercises/dialog", `chest sources are listed read-only (${links} links)`, links >= 3);
  check("exercises/dialog", "confidence is shown", /güven · \d+ tahmin/.test(await dialog.innerText()));
  await shot("exercise-dialog-literature", dialog);

  // Edit: type a value off the grid, commit, save.
  await chest.fill("0,83");
  await chest.press("Tab");
  check("exercises/dialog", "a typed load snaps to the 0.05 grid", (await chest.inputValue()) === "0,85");
  const triceps = dialog.getByRole("textbox", { name: "Triceps yükü (sayı)" });
  await triceps.click();
  await triceps.press("ArrowUp");
  const tricepsValue = await triceps.inputValue();
  await shot("exercise-dialog-edited", dialog);
  await dialog.getByRole("button", { name: /^kaydet$/i }).click();
  await dialog.waitFor({ state: "hidden", timeout: 10_000 });

  h.setWhere("exercises/saved");
  const saved = (await api(`/admin/exercises/${bench.id}`)).exercise.muscles;
  check("exercises/saved", "the API stored chest 0.85", saved.find((m) => m.key === "chest")?.load === 0.85);
  check("exercises/saved", `the API stored triceps ${tricepsValue}`, String(saved.find((m) => m.key === "triceps")?.load).replace(".", ",") === tricepsValue);

  await p.reload({ waitUntil: "networkidle" });
  await p.getByText(NAME, { exact: true }).first().waitFor({ timeout: 20_000 });
  dialog = await openDialog();
  check("exercises/saved", "the edit survives a reload", (await dialog.getByRole("textbox", { name: "Göğüs yükü (sayı)" }).inputValue()) === "0,85");

  h.setWhere("exercises/restore");
  await dialog.getByRole("button", { name: /literatür değerlerine dön/i }).click();
  await dialog.getByRole("button", { name: /^kaydet$/i }).click();
  await dialog.waitFor({ state: "hidden", timeout: 10_000 });
  const restored = (await api(`/admin/exercises/${bench.id}`)).exercise.muscles;
  const reference = (await api(`/admin/exercises/${bench.id}`)).reference.muscles.map(({ key, load }) => ({ key, load }));
  const byKey = (list) => JSON.stringify([...list].sort((a, b) => a.key.localeCompare(b.key)));
  check("exercises/restore", "one click restores every literature value", byKey(restored) === byKey(reference));
} catch (e) {
  rec.fail("exception", e instanceof Error ? e.message : String(e));
} finally {
  await h.close();
}

process.exit(rec.summary(`admin activation (${SCHEME})`) ? 1 : 0);
