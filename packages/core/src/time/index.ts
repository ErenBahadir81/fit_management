/**
 * TÜRKİYE TIME (Europe/Istanbul) helpers + week boundaries.
 * Türkiye is permanently UTC+3 (no DST since 2016), so a fixed offset is safe and every
 * computation is independent of the host timezone (epoch + getUTC*).
 */
export const TR_TZ = "Europe/Istanbul";
export const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** 0 = Sunday … 6 = Saturday (JS convention). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"] as const;
export const WEEKDAYS_TR_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function shift(d: Date): Date {
  return new Date(d.getTime() + TR_OFFSET_MS);
}

export function isDateKey(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_KEY_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 'YYYY-MM-DD' of the Türkiye local day containing instant `d`. */
export function trDateKey(d: Date = new Date()): string {
  const s = shift(d);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
}

/** Weekday (0=Sunday) of the Türkiye local day containing `d`. */
export function trWeekday(d: Date = new Date()): Weekday {
  return shift(d).getUTCDay() as Weekday;
}

/** [00:00, next 00:00) of the Türkiye local day containing `d`, as UTC instants. */
export function trDayBounds(d: Date = new Date()): { start: Date; end: Date } {
  const s = shift(d);
  const startMs = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - TR_OFFSET_MS;
  return { start: new Date(startMs), end: new Date(startMs + DAY_MS) };
}

export function trStartOfDay(d: Date = new Date()): Date {
  return trDayBounds(d).start;
}

/** Instant of 00:00 TR for a dateKey. */
export function keyToStart(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - TR_OFFSET_MS);
}

/** [start, end) instants for a dateKey. */
export function keyBounds(key: string): { start: Date; end: Date } {
  const start = keyToStart(key);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Weekday (0=Sunday) of a dateKey — timezone independent. */
export function keyWeekday(key: string): Weekday {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() as Weekday;
}

/** Shift a dateKey by `deltaDays` (calendar arithmetic, tz independent). */
export function shiftKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

/** Inclusive list of dateKeys from `from` to `to`. */
export function keyRange(from: string, to: string): string[] {
  const n = daysBetween(from, to);
  if (n < 0) return [];
  const out: string[] = [];
  for (let i = 0; i <= n; i++) out.push(shiftKey(from, i));
  return out;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/* ------------------------------- weeks ---------------------------------- */

/**
 * The week containing `key` starts on the most recent `startWeekday` (0=Sunday … 6=Saturday)
 * on or before `key`. Returns that start day's key (= the week key).
 */
export function weekKeyFor(key: string, startWeekday: Weekday): string {
  const wd = keyWeekday(key);
  const back = (wd - startWeekday + 7) % 7;
  return shiftKey(key, -back);
}

export interface WeekRange {
  weekKey: string;
  startKey: string;
  endKey: string; // inclusive, startKey + 6
  keys: string[]; // 7 keys
}

export function weekRange(weekKey: string): WeekRange {
  const endKey = shiftKey(weekKey, 6);
  return { weekKey, startKey: weekKey, endKey, keys: keyRange(weekKey, endKey) };
}

/** 0..6 index of `key` inside its week, or null if outside. */
export function dayIndexInWeek(key: string, weekKey: string): number | null {
  const i = daysBetween(weekKey, key);
  return i >= 0 && i < 7 ? i : null;
}

/** Previous `n` week keys (most recent first, excluding `weekKey` itself when `includeSelf` is false). */
export function previousWeekKeys(weekKey: string, n: number, includeSelf = false): string[] {
  const out: string[] = [];
  for (let i = includeSelf ? 0 : 1; out.length < n; i++) out.push(shiftKey(weekKey, -7 * i));
  return out;
}

/** Date formatting always in Türkiye time (tr-TR). */
export function formatTRDate(d: Date | string, opts: Intl.DateTimeFormatOptions): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("tr-TR", { ...opts, timeZone: TR_TZ });
}

/** Age in whole years at `at` for a YYYY-MM-DD birth date. */
export function ageFromBirthDate(birthDate: string, at: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = at.split("-").map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return Math.max(0, age);
}
