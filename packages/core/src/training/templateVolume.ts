import { round } from "../utils/index";

/**
 * Planned volume of a program template / program (owner: B1 — admin program templates).
 * Kept self-contained so it can live next to B2's training engines without coupling to them.
 */
export interface PlannedExerciseLike {
  targetSets?: number;
  muscles?: ReadonlyArray<{ key: string; load?: number } | string>;
}
export interface PlannedDayLike {
  exercises?: ReadonlyArray<PlannedExerciseLike>;
}

/**
 * Sets per muscle over one full cycle: Σ over days of `targetSets × load`.
 * For a 7-day cycle this equals weekly volume; shorter/longer cycles report per cycle.
 * Accepts both the v2 `{key, load}` and the legacy v1 `string[]` muscle shapes.
 */
export function templateWeeklyVolume(days: ReadonlyArray<PlannedDayLike>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of days ?? []) {
    for (const ex of day?.exercises ?? []) {
      const sets = typeof ex?.targetSets === "number" && Number.isFinite(ex.targetSets) ? ex.targetSets : 0;
      if (sets <= 0) continue;
      for (const raw of ex.muscles ?? []) {
        const key = typeof raw === "string" ? raw : raw?.key;
        if (!key) continue;
        const rawLoad = typeof raw === "string" ? 1 : raw.load;
        const load = typeof rawLoad === "number" && Number.isFinite(rawLoad) ? Math.min(1, Math.max(0, rawLoad)) : 1;
        out[key] = round((out[key] ?? 0) + sets * load, 2);
      }
    }
  }
  return out;
}
