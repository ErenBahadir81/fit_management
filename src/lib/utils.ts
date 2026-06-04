import { clsx, type ClassValue } from "clsx";
import { trDateKey, trMondayIndex } from "./time";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function round(n: number, digits = 1) {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** "5,2 km" tarzı TR sayı biçimi */
export function fmtNum(n: number, digits = 1) {
  return round(n, digits).toLocaleString("tr-TR", {
    maximumFractionDigits: digits,
  });
}

/** dakikayı "32 dk" / saati "1s 5dk" biçimine çevirir */
export function fmtMinutes(min: number) {
  const m = Math.round(min);
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}s ${r}dk` : `${h}s`;
}

/** pace: dk/km -> "5'30\"/km" */
export function fmtPace(minPerKm: number) {
  if (!isFinite(minPerKm) || minPerKm <= 0) return "—";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}'${String(s).padStart(2, "0")}"/km`;
}

/** 'YYYY-MM-DD' — Türkiye yerel günü (saat dilimi: Europe/Istanbul). */
export function todayKey(d: Date = new Date()) {
  return trDateKey(d);
}

export const WEEKDAYS_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
export const WEEKDAYS_TR_LONG = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

/** 0=Pazartesi … 6=Pazar — Türkiye gününe göre. */
export function mondayIndex(d: Date = new Date()) {
  return trMondayIndex(d);
}
