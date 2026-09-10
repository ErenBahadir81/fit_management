/**
 * Weekly volume matrix for the program-template builder.
 *
 * `@fitfloow/core/training` is still a stub while B2 builds it, so the matrix is computed
 * here: Σ (targetSets × muscle load) per muscle over the cycle, normalised to seven days so
 * it can be compared with the per-week targets admins set on /muscles.
 */
import { round, type DayDTO, type MuscleDTO } from "@fitfloow/core";

export type VolumeStatus = "under" | "in" | "over" | "none";

export interface VolumeRow {
  key: string;
  name: string;
  short: string;
  color: string;
  region: MuscleDTO["region"];
  size: MuscleDTO["size"];
  /** Sets over the whole cycle (however many days it has). */
  cycleSets: number;
  /** Cycle sets scaled to a 7-day week — this is what the targets are written against. */
  weeklySets: number;
  cycleLength: number;
  byDay: number[];
  target: MuscleDTO["weeklyTarget"];
  status: VolumeStatus;
}

export function volumeStatus(weeklySets: number, target: MuscleDTO["weeklyTarget"]): VolumeStatus {
  if (weeklySets <= 0.001) return "none";
  const min = target.min ?? 0;
  if (weeklySets < min - 0.001) return "under";
  if (weeklySets > target.max + 0.001) return "over";
  return "in";
}

export function templateVolume(days: DayDTO[], muscles: MuscleDTO[]): VolumeRow[] {
  const cycleLength = days.length;
  const index = new Map<string, number[]>();
  for (const m of muscles) index.set(m.key, new Array<number>(cycleLength).fill(0));

  days.forEach((day, dayIdx) => {
    for (const ex of day.exercises) {
      for (const load of ex.muscles ?? []) {
        const row = index.get(load.key);
        if (!row) continue; // muscle removed from the catalog since the template was written
        row[dayIdx] += ex.targetSets * load.load;
      }
    }
  });

  return muscles.map((m) => {
    const byDay = (index.get(m.key) ?? []).map((n) => round(n, 2));
    const cycleSets = round(
      byDay.reduce((a, b) => a + b, 0),
      2
    );
    const weeklySets = cycleLength > 0 ? round((cycleSets * 7) / cycleLength, 2) : 0;
    return {
      key: m.key,
      name: m.name,
      short: m.short,
      color: m.color,
      region: m.region,
      size: m.size,
      cycleSets,
      weeklySets,
      cycleLength,
      byDay,
      target: m.weeklyTarget,
      status: volumeStatus(weeklySets, m.weeklyTarget),
    };
  });
}

export const VOLUME_STATUS_TR: Record<VolumeStatus, string> = {
  under: "Az",
  in: "Hedefte",
  over: "Fazla",
  none: "Yok",
};

/** Total planned sets across a cycle — shown as a headline number in the builder. */
export function totalPlannedSets(days: DayDTO[]): number {
  return days.reduce((sum, d) => sum + d.exercises.reduce((s, e) => s + e.targetSets, 0), 0);
}
