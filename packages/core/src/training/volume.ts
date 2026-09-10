/**
 * WEEKLY VOLUME — sets per muscle, done vs. the admin-configured weekly target.
 * Done volume is load weighted exactly like fatigue (`sets × load`), so the numbers a user
 * sees in "recovery" and in "volume" can never disagree.
 */
import { round } from "../utils/index";
import type { DayDTO, MuscleDTO, MuscleVolume } from "../schemas/index";
import type { zVolumeStatus } from "../schemas/program";
import type { z } from "zod";
import { buildHits, effectiveSets, type MuscleHit } from "./recovery";
import { templateWeeklyVolume, type PlannedDayLike } from "./templateVolume";
import { WEEK_MS, toMs, type WorkoutLogLike } from "./types";

export type VolumeStatus = z.infer<typeof zVolumeStatus>;

export interface WeeklyTarget {
  min?: number;
  max: number;
}

/**
 * `none` — nothing done for this muscle yet; otherwise the volume is compared with the
 * admin target band: below `min` (0 when the muscle only has a ceiling) is `under`, above
 * `max` is `over`. Kept identical to the admin template builder so both surfaces agree.
 */
export function volumeStatus(done: number, target: WeeklyTarget): VolumeStatus {
  if (done <= 0.001) return "none";
  const min = typeof target?.min === "number" ? target.min : 0;
  if (done < min - 0.001) return "under";
  if (done > (target?.max ?? 0) + 0.001) return "over";
  return "in";
}

/** Load-weighted sets per muscle key inside `windowMs` (default 7 days) before `now`. */
export function setsByMuscle(
  hits: readonly MuscleHit[],
  now: Date | number | string,
  windowMs: number = WEEK_MS
): Record<string, number> {
  const nowMs = toMs(now);
  const out: Record<string, number> = {};
  for (const h of hits ?? []) {
    if (!h || !Number.isFinite(h.at) || h.at > nowMs || nowMs - h.at > windowMs) continue;
    out[h.key] = round((out[h.key] ?? 0) + effectiveSets(h), 2);
  }
  return out;
}

/** One row per given muscle: sets done in the last 7 days vs. its weekly target. */
export function weeklyVolume(
  logs: readonly WorkoutLogLike[],
  muscles: readonly MuscleDTO[],
  now: Date | number | string,
  windowMs: number = WEEK_MS
): MuscleVolume[] {
  const done = setsByMuscle(buildHits(logs), now, windowMs);
  return (muscles ?? []).map((m) => {
    const value = round(done[m.key] ?? 0, 1);
    return { key: m.key, name: m.name, done: value, target: m.weeklyTarget, status: volumeStatus(value, m.weeklyTarget) };
  });
}

/**
 * Planned sets per muscle for one full cycle of a program/template (`targetSets × load`).
 * For the 7-day seed program this is weekly volume (chest 17, frontDelt 9, …).
 * Mobility work (`metric: "stretch"`) is excluded, mirroring `buildHits`.
 */
export function templateVolume(days: ReadonlyArray<DayDTO | PlannedDayLike>): Record<string, number> {
  const trainable = (days ?? []).map((d) => ({
    exercises: (d?.exercises ?? []).filter((e) => (e as { metric?: string })?.metric !== "stretch"),
  }));
  return templateWeeklyVolume(trainable);
}
