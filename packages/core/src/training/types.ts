/**
 * Structural (duck-typed) views of the training documents the pure engines consume.
 * Every DTO from `../schemas/program` is assignable to these, and so are the lean Mongo
 * documents the API reads — so no mapping layer is needed in either direction.
 */
import { DAY_MS } from "../time/index";


/** A logged exercise. `muscles` accepts the v2 `{key, load}` shape and the v1 `string[]` shape. */
export interface StrengthEntryLike {
  name?: string;
  muscles?: ReadonlyArray<{ key: string; load?: number } | string>;
  skipped?: boolean;
  metric?: string;
  sets?: ReadonlyArray<unknown>;
}

export interface CardioEntryLike {
  segments?: ReadonlyArray<{ km?: number; min?: number }>;
  totalKm?: number;
  totalMin?: number;
}

export interface WorkoutLogLike {
  id?: string;
  date: string | number | Date;
  dateKey?: string;
  isOffDay?: boolean;
  dayOrder?: number;
  strength?: ReadonlyArray<StrengthEntryLike>;
  run?: CardioEntryLike | null;
  swim?: CardioEntryLike | null;
}

/** Minimal program shape the pointer/schedule helpers need. */
export interface ProgramLike<TDay = unknown> {
  days: ReadonlyArray<TDay>;
  currentIndex: number;
  weekNumber?: number;
}

export const HOUR_MS = 3_600_000;
export const WEEK_MS = 7 * DAY_MS;

/** Accepts `Date`, epoch ms or an ISO string; `NaN` for garbage. */
export function toMs(t: Date | number | string): number {
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  return new Date(t).getTime();
}

/** Normalizes both muscle shapes to `{key, load}` (missing/invalid load ⇒ 1). */
export function normalizeMuscleLoads(
  input: ReadonlyArray<{ key: string; load?: number } | string> | undefined | null
): Array<{ key: string; load: number }> {
  if (!Array.isArray(input)) return [];
  const out: Array<{ key: string; load: number }> = [];
  for (const raw of input) {
    if (typeof raw === "string") {
      if (raw) out.push({ key: raw, load: 1 });
      continue;
    }
    if (!raw || typeof raw.key !== "string" || !raw.key) continue;
    const load = typeof raw.load === "number" && Number.isFinite(raw.load) ? Math.min(1, Math.max(0, raw.load)) : 1;
    out.push({ key: raw.key, load });
  }
  return out;
}
