import { WEEKDAYS_TR, WEEKDAYS_TR_SHORT, daysBetween, trDateKey, type Weekday } from "@fitfloow/core";
import { fmtDate } from "./format";

/** Hour of day (0–23) in Türkiye time. */
export function trHour(d: Date = new Date()): number {
  return (d.getUTCHours() + 3) % 24;
}

export function todayKey(now: Date = new Date()): string {
  return trDateKey(now);
}

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Günaydın";
  if (hour >= 12 && hour < 18) return "İyi günler";
  if (hour >= 18 && hour < 22) return "İyi akşamlar";
  return "İyi geceler";
}

export function relativeDayLabel(key: string, today: string = todayKey()): string {
  const diff = daysBetween(today, key);
  if (diff === 0) return "Bugün";
  if (diff === -1) return "Dün";
  if (diff === 1) return "Yarın";
  return fmtDate(key);
}

export function weekdayName(i: Weekday | number): string {
  return WEEKDAYS_TR[i as Weekday];
}
export function weekdayShort(i: Weekday | number): string {
  return WEEKDAYS_TR_SHORT[i as Weekday];
}
