/**
 * TRAINING STATS — weekly buckets aligned to the user's measurement day (their week start),
 * plus the current training streak. Pure: the caller supplies the logs it already read.
 */
import { round } from "../utils/index";
import { previousWeekKeys, shiftKey, trDateKey, weekKeyFor, type Weekday } from "../time/index";
import type { MuscleDTO, TrainingStats } from "../schemas/index";
import { buildHits, effectiveSets } from "./recovery";
import { toMs, type WorkoutLogLike } from "./types";

export interface TrainingStatsInput {
  logs: readonly WorkoutLogLike[];
  muscles: readonly MuscleDTO[];
  /** How many weekly buckets to return (current week included). */
  weeks: number;
  measurementDay: Weekday;
  todayKey: string;
}

function keyOf(log: WorkoutLogLike): string {
  return log.dateKey ?? trDateKey(new Date(toMs(log.date)));
}

function cardioKm(log: WorkoutLogLike): number {
  const one = (c: { totalKm?: number; segments?: ReadonlyArray<{ km?: number }> } | null | undefined): number => {
    if (!c) return 0;
    if (typeof c.totalKm === "number") return c.totalKm;
    return (c.segments ?? []).reduce((s, seg) => s + (Number(seg?.km) || 0), 0);
  };
  return one(log.run) + one(log.swim);
}

/** Number of sets actually logged (skipped and mobility entries excluded). */
export function loggedSets(log: WorkoutLogLike): number {
  let n = 0;
  for (const e of log.strength ?? []) {
    if (!e || e.skipped || e.metric === "stretch") continue;
    n += Array.isArray(e.sets) ? e.sets.length : 0;
  }
  return n;
}

/** Consecutive days with a session, ending today (a session-free today does not break it yet). */
export function workoutStreak(logs: readonly WorkoutLogLike[], todayKey: string): number {
  const days = new Set<string>();
  for (const log of logs ?? []) if (log && !log.isOffDay) days.add(keyOf(log));
  let cursor = days.has(todayKey) ? todayKey : shiftKey(todayKey, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftKey(cursor, -1);
  }
  return streak;
}

/** Weekly buckets, oldest first. Logs outside the requested window are ignored. */
export function buildTrainingStats(input: TrainingStatsInput): TrainingStats {
  const { logs, muscles, measurementDay, todayKey } = input;
  const weeks = Math.max(1, Math.trunc(input.weeks || 1));
  const currentWeek = weekKeyFor(todayKey, measurementDay);
  const weekKeys = previousWeekKeys(currentWeek, weeks, true).reverse(); // oldest → newest
  const known = new Set(muscles.map((m) => m.key));

  const buckets = new Map<string, TrainingStats["weeks"][number]>();
  for (const weekKey of weekKeys) buckets.set(weekKey, { weekKey, sessions: 0, sets: 0, cardioKm: 0, volumeByMuscle: {} });

  for (const log of logs ?? []) {
    if (!log || log.isOffDay) continue;
    const bucket = buckets.get(weekKeyFor(keyOf(log), measurementDay));
    if (!bucket) continue;
    bucket.sessions += 1;
    bucket.sets += loggedSets(log);
    bucket.cardioKm = round(bucket.cardioKm + cardioKm(log), 2);
    for (const hit of buildHits([log])) {
      if (!known.has(hit.key)) continue;
      bucket.volumeByMuscle[hit.key] = round((bucket.volumeByMuscle[hit.key] ?? 0) + effectiveSets(hit), 1);
    }
  }

  return {
    weeks: weekKeys.map((k) => buckets.get(k)!),
    streakDays: workoutStreak(logs, todayKey),
    totalSessions: (logs ?? []).filter((l) => l && !l.isOffDay).length,
  };
}
