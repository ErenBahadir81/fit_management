import { describe, expect, it } from "vitest";
import { setsByMuscle, templateVolume, volumeStatus, weeklyVolume } from "./volume";
import { buildHits } from "./recovery";
import { EREN_DAYS, INCI_DAYS, muscle, TEST_MUSCLES } from "./fixtures";
import { DAY_MS } from "../time/index";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS).toISOString();
const log = (d: number, entries: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => ({
  date: daysAgo(d),
  isOffDay: false,
  strength: entries,
  ...extra,
});
const ex = (muscles: Array<string | { key: string; load: number }>, sets: number, extra: Record<string, unknown> = {}) => ({
  name: "X",
  muscles: muscles.map((m) => (typeof m === "string" ? { key: m, load: 1 } : m)),
  sets: Array.from({ length: sets }, () => ({ reps: 10, rir: 2 })),
  ...extra,
});

describe("templateVolume — v1 seed program numbers", () => {
  it("reproduces Eren's weekly sets per muscle", () => {
    expect(templateVolume(EREN_DAYS)).toEqual({
      chest: 17,
      frontDelt: 9,
      sideDelt: 6,
      traps: 9,
      lats: 10,
      abs: 6,
      legs: 14,
    });
  });

  it("reproduces İnci's 4-day cycle and ignores the stretch day", () => {
    expect(templateVolume(INCI_DAYS)).toEqual({ legs: 5, frontDelt: 5, sideDelt: 5, traps: 5, abs: 5 });
  });

  it("weighs planned sets by the exercise→muscle load", () => {
    const days = [
      {
        order: 1,
        title: "T",
        focus: "",
        kind: "strength" as const,
        exercises: [
          { name: "Row", muscles: [{ key: "lats", load: 1 }, { key: "traps", load: 0.5 }], targetSets: 4, targetReps: 10, targetRIR: null, metric: "reps" as const },
        ],
        run: null,
        swim: null,
      },
    ];
    expect(templateVolume(days)).toEqual({ lats: 4, traps: 2 });
  });

  it("is empty for a rest-only program", () => {
    expect(templateVolume([{ order: 1, title: "Rest", focus: "", kind: "rest", exercises: [], run: null, swim: null }])).toEqual({});
  });
});

describe("volumeStatus", () => {
  it("is `none` while nothing has been done", () => {
    expect(volumeStatus(0, { max: 6 })).toBe("none");
    expect(volumeStatus(0, { min: 15, max: 20 })).toBe("none");
  });
  it("treats a muscle with only a ceiling as satisfied by any work below it", () => {
    expect(volumeStatus(5, { max: 6 })).toBe("in");
    expect(volumeStatus(6, { max: 6 })).toBe("in");
    expect(volumeStatus(7, { max: 6 })).toBe("over");
  });
  it("uses the min..max band when both are configured", () => {
    expect(volumeStatus(14, { min: 15, max: 20 })).toBe("under");
    expect(volumeStatus(17, { min: 15, max: 20 })).toBe("in");
    expect(volumeStatus(21, { min: 15, max: 20 })).toBe("over");
  });
});

describe("setsByMuscle / weeklyVolume", () => {
  it("sums load-weighted sets inside the 7-day window only", () => {
    const hits = buildHits([
      log(8, [ex(["chest"], 5)]), // outside
      log(2, [ex(["chest"], 4)]),
      log(1, [ex([{ key: "chest", load: 0.5 }], 4)]),
    ]);
    expect(setsByMuscle(hits, NOW)).toEqual({ chest: 6 });
  });

  it("builds one row per active muscle with target + status", () => {
    const logs = [log(1, [ex(["chest"], 9), ex(["legs"], 16)]), log(3, [ex(["chest"], 8)])];
    const rows = weeklyVolume(logs, TEST_MUSCLES, NOW);
    expect(rows.map((r) => r.key)).toEqual(TEST_MUSCLES.map((m) => m.key));
    expect(rows.find((r) => r.key === "chest")).toEqual({
      key: "chest",
      name: "Göğüs",
      done: 17,
      target: { min: 15, max: 20 },
      status: "in",
    });
    expect(rows.find((r) => r.key === "legs")).toMatchObject({ done: 16, status: "over" });
    expect(rows.find((r) => r.key === "abs")).toMatchObject({ done: 0, status: "none" });
  });

  it("ignores off-days, skipped and stretch entries", () => {
    const logs = [
      log(1, [ex(["abs"], 5)], { isOffDay: true }),
      log(1, [ex(["abs"], 5, { skipped: true })]),
      log(1, [ex(["abs"], 5, { metric: "stretch" })]),
    ];
    expect(weeklyVolume(logs, [muscle("abs")], NOW)[0].done).toBe(0);
  });

  it("rounds fractional loads to one decimal", () => {
    const logs = [log(1, [ex([{ key: "lats", load: 0.33 }], 3)])];
    expect(weeklyVolume(logs, [muscle("lats")], NOW)[0].done).toBe(1);
  });
});
