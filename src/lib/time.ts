/**
 * TÜRKİYE SAATİ (Europe/Istanbul) yardımcıları.
 *
 * Türkiye 2016'dan beri kalıcı olarak UTC+3'tür (yaz saati / DST yok), bu yüzden
 * sabit +3 offset güvenlidir. Tüm hesaplar epoch (getTime) + getUTC* ile yapılır;
 * dolayısıyla SUNUCUNUN saat diliminden TAMAMEN BAĞIMSIZDIR.
 */
export const TR_TZ = "Europe/Istanbul";
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Anı Türkiye duvar saatine kaydırılmış Date (yalnızca getUTC* ile okunmalı). */
function shift(d: Date): Date {
  return new Date(d.getTime() + TR_OFFSET_MS);
}

/** 'YYYY-MM-DD' — Türkiye yerel günü. */
export function trDateKey(d: Date = new Date()): string {
  const s = shift(d);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
}

/** 0=Pazartesi … 6=Pazar — Türkiye gününe göre. */
export function trMondayIndex(d: Date = new Date()): number {
  return (shift(d).getUTCDay() + 6) % 7;
}

/** Türkiye yerel gününün [00:00, ertesi 00:00) sınırları — UTC instant olarak. */
export function trDayBounds(d: Date = new Date()): { start: Date; end: Date } {
  const s = shift(d);
  const startMs =
    Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - TR_OFFSET_MS;
  return { start: new Date(startMs), end: new Date(startMs + DAY_MS) };
}

/** Türkiye yerel gün başı (UTC instant). */
export function trStartOfDay(d: Date = new Date()): Date {
  return trDayBounds(d).start;
}

/** n gün eklenmiş yeni an (DST yok → tam 24s güvenli). */
export function trAddDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** dateKey'den Pazartesi-index (tz bağımsız; key zaten Türkiye günü). */
export function trMondayIndexFromKey(key: string): number {
  const [y, m, dd] = key.split("-").map(Number);
  return (new Date(Date.UTC(y, (m || 1) - 1, dd || 1, 12)).getUTCDay() + 6) % 7;
}

/** dateKey'i delta gün kaydırır (tz bağımsız takvim aritmetiği). */
export function trShiftKey(key: string, deltaDays: number): string {
  const [y, m, dd] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, dd || 1, 12));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Her zaman Türkiye saat dilimiyle tr-TR tarih biçimi. */
export function formatTRDate(
  d: Date | string,
  opts: Intl.DateTimeFormatOptions
): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("tr-TR", { ...opts, timeZone: TR_TZ });
}
