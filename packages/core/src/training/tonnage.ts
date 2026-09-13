/**
 * TONNAGE — the load actually moved in a session: `Σ reps × weightKg`.
 *
 * Load arrived with 2.1; every set logged before it has none. A missing `weightKg` is `null`
 * ("bodyweight, or simply not recorded"), never 0 kg, and adds nothing to tonnage — so a
 * historical read reports an honest 0 instead of a fabricated number, and never throws.
 * Skipped and mobility entries are excluded, exactly like `loggedSets`.
 */
import { round } from "../utils/index";
import type { SetEntryLike, StrengthEntryLike, WorkoutLogLike } from "./types";

/** Load moved by one set. Anything unrecorded, negative or non-finite counts as 0. */
export function setVolumeKg(set: SetEntryLike | null | undefined): number {
  const reps = Number(set?.reps);
  const weightKg = set?.weightKg;
  if (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg <= 0) return 0;
  if (!Number.isFinite(reps) || reps <= 0) return 0;
  return round(reps * weightKg, 2);
}

/** Tonnage of one logged exercise; 0 when it was skipped, mobility work, or has no load. */
export function entryTonnageKg(entry: StrengthEntryLike | null | undefined): number {
  if (!entry || entry.skipped || entry.metric === "stretch") return 0;
  if (!Array.isArray(entry.sets)) return 0;
  let total = 0;
  for (const set of entry.sets) total += setVolumeKg(set);
  return round(total, 2);
}

/** Tonnage of a whole session. */
export function logTonnageKg(log: WorkoutLogLike | null | undefined): number {
  let total = 0;
  for (const entry of log?.strength ?? []) total += entryTonnageKg(entry);
  return round(total, 2);
}
