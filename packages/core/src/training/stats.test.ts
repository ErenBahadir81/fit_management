import { describe, expect, it } from "vitest";
import { buildTrainingStats, loggedSets, workoutStreak } from "./stats";
import { TEST_MUSCLES } from "./fixtures";

const TODAY = "2026-09-10"; // Thursday
const sets = (n: number) => Array.from({ length: n }, () => ({ reps: 10, rir: 2 }));
const log = (dateKey: string, entries: Array<Record<string, unknown>> = [], extra: Record<string, unknown> = {}) => ({
  id: `l-${dateKey}`,
  date: `${dateKey}T09:00:00.000Z`,
  dateKey,
  isOffDay: false,
  strength: entries,
  run: null,
  swim: null,
  ...extra,
});
const ex = (key: string, n: number, load = 1, extra: Record<string, unknown> = {}) => ({
  name: key,
  muscles: [{ key, load }],
  sets: sets(n),
  ...extra,
});

describe("loggedSets", () => {
  it("counts only real work", () => {
    expect(loggedSets(log(TODAY, [ex("chest", 4), ex("abs", 3, 1, { skipped: true }), ex("legs", 2, 1, { metric: "stretch" })]))).toBe(4);
  });
});

describe("workoutStreak", () => {
  it("counts consecutive training days ending today", () => {
    const logs = [log("2026-09-08"), log("2026-09-09"), log(TODAY)];
    expect(workoutStreak(logs, TODAY)).toBe(3);
  });
  it("still counts when today has not been trained yet", () => {
    expect(workoutStreak([log("2026-09-08"), log("2026-09-09")], TODAY)).toBe(2);
  });
  it("breaks on a gap and ignores off-days", () => {
    expect(workoutStreak([log("2026-09-07"), log("2026-09-09", [], { isOffDay: true }), log(TODAY)], TODAY)).toBe(1);
  });
  it("is 0 without logs", () => {
    expect(workoutStreak([], TODAY)).toBe(0);
  });
});

describe("buildTrainingStats", () => {
  const base = { muscles: TEST_MUSCLES, weeks: 3, todayKey: TODAY };

  it("buckets by the user's week start (Sunday) oldest first", () => {
    const stats = buildTrainingStats({ ...base, measurementDay: 0, logs: [log(TODAY, [ex("chest", 5)]), log("2026-09-03", [ex("legs", 4)])] });
    expect(stats.weeks.map((w) => w.weekKey)).toEqual(["2026-08-23", "2026-08-30", "2026-09-06"]);
    expect(stats.weeks[2]).toMatchObject({ sessions: 1, sets: 5, volumeByMuscle: { chest: 5 } });
    expect(stats.weeks[1]).toMatchObject({ sessions: 1, sets: 4, volumeByMuscle: { legs: 4 } });
    expect(stats.weeks[0]).toMatchObject({ sessions: 0, sets: 0, cardioKm: 0, volumeByMuscle: {} });
  });

  it("respects a Monday week start", () => {
    const stats = buildTrainingStats({ ...base, measurementDay: 1, logs: [] });
    expect(stats.weeks.map((w) => w.weekKey)).toEqual(["2026-08-24", "2026-08-31", "2026-09-07"]);
  });

  it("weighs volume by load and sums cardio km", () => {
    const stats = buildTrainingStats({
      ...base,
      measurementDay: 0,
      logs: [
        log(TODAY, [ex("chest", 4), ex("traps", 4, 0.5)], { run: { segments: [{ km: 5, min: 27 }], totalKm: 5, totalMin: 27, targetKm: 5, targetMin: 30 } }),
        log("2026-09-09", [], { swim: { segments: [{ km: 1, min: 30 }], totalKm: 1, totalMin: 30, targetKm: 1, targetMin: 35 } }),
      ],
    });
    const w = stats.weeks[2];
    expect(w).toMatchObject({ sessions: 2, sets: 8, cardioKm: 6 });
    expect(w.volumeByMuscle).toEqual({ chest: 4, traps: 2 });
  });

  it("drops unknown muscle keys and off-day logs", () => {
    const stats = buildTrainingStats({
      ...base,
      measurementDay: 0,
      logs: [log(TODAY, [ex("ghost", 5), ex("abs", 3)]), log("2026-09-09", [ex("abs", 3)], { isOffDay: true })],
    });
    expect(stats.weeks[2].volumeByMuscle).toEqual({ abs: 3 });
    expect(stats.weeks[2].sessions).toBe(1);
    expect(stats.totalSessions).toBe(1);
  });

  it("ignores logs older than the requested window", () => {
    const stats = buildTrainingStats({ ...base, weeks: 1, measurementDay: 0, logs: [log("2026-08-20", [ex("chest", 5)])] });
    expect(stats.weeks).toHaveLength(1);
    expect(stats.weeks[0]).toMatchObject({ weekKey: "2026-09-06", sessions: 0 });
  });
});
