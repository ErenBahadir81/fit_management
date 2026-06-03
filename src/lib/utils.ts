import { clsx, type ClassValue } from "clsx";

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

export function todayKey(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

/** JS getDay() (0=Paz) -> bizim index (0=Pzt) */
export function mondayIndex(d: Date = new Date()) {
  return (d.getDay() + 6) % 7;
}
