/**
 * tr-TR number/date formatting for the UI. Every number on screen goes through here so the
 * decimal comma, thousands dot and Turkish month names are consistent (and `tabular-nums` friendly).
 */
import { TR_TZ, WEEKDAYS_TR, keyToStart, keyWeekday, trDateKey, trWeekday } from "@fitfloow/core";

const EMPTY = "—";
const MINUS = "−"; // U+2212, aligns with digits unlike the hyphen

const nf = new Map<string, Intl.NumberFormat>();
function numberFormat(min: number, max: number): Intl.NumberFormat {
  const k = `${min}:${max}`;
  let f = nf.get(k);
  if (!f) {
    f = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: min, maximumFractionDigits: max });
    nf.set(k, f);
  }
  return f;
}

type Num = number | null | undefined;
const isNum = (n: Num): n is number => typeof n === "number" && Number.isFinite(n);

export function fmtNumber(n: Num, digits = 1): string {
  return isNum(n) ? numberFormat(digits, digits).format(n) : EMPTY;
}
export function fmtInt(n: Num): string {
  return isNum(n) ? numberFormat(0, 0).format(Math.round(n)) : EMPTY;
}
export function fmtKg(n: Num, digits = 1): string {
  return isNum(n) ? `${fmtNumber(n, digits)} kg` : EMPTY;
}
export function fmtCm(n: Num, digits = 1): string {
  return isNum(n) ? `${fmtNumber(n, digits)} cm` : EMPTY;
}
export function fmtGrams(n: Num): string {
  return isNum(n) ? `${fmtInt(n)} g` : EMPTY;
}
export function fmtKcal(n: Num): string {
  return isNum(n) ? `${fmtInt(n)} kcal` : EMPTY;
}
/** Turkish convention: the percent sign leads ("%18,2"). */
export function fmtPct(n: Num, digits = 1): string {
  return isNum(n) ? `%${fmtNumber(n, digits)}` : EMPTY;
}
/** Signed delta with a typographic minus: "−0,4 kg", "+1,3 kg", "0,0 kg". */
export function fmtDelta(n: Num, unit = "", digits = 1): string {
  if (!isNum(n)) return EMPTY;
  const rounded = Number(n.toFixed(digits));
  const body = fmtNumber(Math.abs(rounded), digits);
  const sign = rounded > 0 ? "+" : rounded < 0 ? MINUS : "";
  return `${sign}${body}${unit ? ` ${unit}` : ""}`;
}
/** Minutes → "1 sa 5 dk" / "45 dk" / "2 sa". */
export function fmtDuration(min: Num): string {
  if (!isNum(min)) return EMPTY;
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} dk`;
  return m === 0 ? `${h} sa` : `${h} sa ${m} dk`;
}

export type DateStyle = "medium" | "long" | "short" | "weekday";

function toDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  // dateKey → noon TR so any tz maths stays inside the same day
  return new Date(keyToStart(input).getTime() + 12 * 60 * 60 * 1000);
}

/** "10 Eylül" | long "10 Eylül 2026" | short "10 Eyl" | weekday "Perşembe, 10 Eylül" — always Türkiye time. */
export function fmtDate(input: string | Date | null | undefined, style: DateStyle = "medium"): string {
  if (!input) return EMPTY;
  const d = toDate(input);
  const base: Intl.DateTimeFormatOptions = { timeZone: TR_TZ, day: "numeric" };
  switch (style) {
    case "long":
      return d.toLocaleDateString("tr-TR", { ...base, month: "long", year: "numeric" });
    case "short":
      return d.toLocaleDateString("tr-TR", { ...base, month: "short" });
    case "weekday": {
      const wd = typeof input === "string" ? keyWeekday(input) : trWeekday(d);
      return `${WEEKDAYS_TR[wd]}, ${d.toLocaleDateString("tr-TR", { ...base, month: "long" })}`;
    }
    default:
      return d.toLocaleDateString("tr-TR", { ...base, month: "long" });
  }
}

/** Re-exported for convenience so features import formatting from one place. */
export { trDateKey };
