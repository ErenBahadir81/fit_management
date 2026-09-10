/** tr-TR formatting helpers. Every number rendered in the admin goes through here. */

const nf = (min: number, max: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: min, maximumFractionDigits: max });

export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return nf(digits, digits).format(value);
}

/** Compact-ish integer with thousands separators (12.480). */
export function int(value: number | null | undefined): string {
  return num(value, 0);
}

export function kcal(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${num(Math.round(value))} kcal`;
}

export function kg(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${num(value, digits)} kg`;
}

export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `%${num(value, digits)}`;
}

/** Signed delta, e.g. "+1,2" / "−0,4" (real minus sign, tr-TR decimals). */
export function delta(value: number | null | undefined, digits = 1, unit = ""): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${num(Math.abs(value), digits)}${unit ? ` ${unit}` : ""}`;
}

const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });
const dateShortFmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", timeZone: "Europe/Istanbul" });
const dateTimeFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Istanbul",
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+03:00` : value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function date(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : "—";
}

export function dateShort(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateShortFmt.format(d) : "—";
}

export function dateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : "—";
}

/** "3 dk önce", "2 sa önce", "5 gün önce" — coarse but honest. */
export function relative(value: string | Date | null | undefined, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return "—";
  const diffSec = Math.round((now.getTime() - d.getTime()) / 1000);
  if (diffSec < 45) return "az önce";
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} gün önce`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} ay önce`;
  return `${Math.round(months / 12)} yıl önce`;
}

export function duration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("");
}

export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${int(n)} ${n === 1 ? singular : (pluralForm ?? singular)}`;
}
