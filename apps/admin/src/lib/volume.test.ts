import { describe, expect, it } from "vitest";
import type { DayDTO, MuscleDTO } from "@fitfloow/core";
import { templateVolume, volumeStatus } from "./volume";

const muscles: MuscleDTO[] = [
  {
    key: "chest",
    name: "Göğüs",
    short: "GÖĞ",
    size: "large",
    fullRecoveryHours: 48,
    weeklyTarget: { min: 10, max: 20 },
    region: "front",
    color: "#6d5df6",
    order: 0,
    active: true,
  },
  {
    key: "triceps",
    name: "Triceps",
    short: "TRI",
    size: "small",
    fullRecoveryHours: 24,
    weeklyTarget: { min: 6, max: 12 },
    region: "arms",
    color: "#12b76a",
    order: 1,
    active: true,
  },
  {
    key: "quads",
    name: "Ön Bacak",
    short: "QUA",
    size: "large",
    fullRecoveryHours: 72,
    weeklyTarget: { max: 18 },
    region: "legs",
    color: "#f79009",
    order: 2,
    active: true,
  },
];

function day(order: number, title: string, exercises: DayDTO["exercises"], kind: DayDTO["kind"] = "strength"): DayDTO {
  return { order, title, focus: "", kind, exercises, run: null, swim: null };
}

const days: DayDTO[] = [
  day(1, "İtiş", [
    { name: "Bench Press", muscles: [{ key: "chest", load: 1 }, { key: "triceps", load: 0.5 }], targetSets: 4, targetReps: 8, targetRIR: 2, metric: "reps" },
    { name: "Dips", muscles: [{ key: "chest", load: 0.6 }, { key: "triceps", load: 1 }], targetSets: 3, targetReps: 10, targetRIR: 1, metric: "reps" },
  ]),
  day(2, "Bacak", [
    { name: "Squat", muscles: [{ key: "quads", load: 1 }], targetSets: 5, targetReps: 5, targetRIR: 2, metric: "reps" },
  ]),
  day(3, "Dinlenme", [], "rest"),
];

describe("templateVolume", () => {
  it("sums targetSets × load per muscle over the whole cycle", () => {
    const rows = templateVolume(days, muscles);
    const chest = rows.find((r) => r.key === "chest")!;
    const triceps = rows.find((r) => r.key === "triceps")!;
    const quads = rows.find((r) => r.key === "quads")!;
    expect(chest.cycleSets).toBeCloseTo(4 * 1 + 3 * 0.6, 5); // 5.8
    expect(triceps.cycleSets).toBeCloseTo(4 * 0.5 + 3 * 1, 5); // 5
    expect(quads.cycleSets).toBeCloseTo(5, 5);
  });

  it("normalises a non-7-day cycle to a week", () => {
    const rows = templateVolume(days, muscles);
    const quads = rows.find((r) => r.key === "quads")!;
    expect(rows[0].cycleLength).toBe(3);
    expect(quads.weeklySets).toBeCloseTo((5 * 7) / 3, 2);
  });

  it("keeps per-day sets so the matrix can show a breakdown", () => {
    const rows = templateVolume(days, muscles);
    const chest = rows.find((r) => r.key === "chest")!;
    expect(chest.byDay).toHaveLength(3);
    expect(chest.byDay[0]).toBeCloseTo(5.8, 5);
    expect(chest.byDay[1]).toBe(0);
    expect(chest.byDay[2]).toBe(0);
  });

  it("returns a row for every active muscle, ordered by muscle order", () => {
    const rows = templateVolume([], muscles);
    expect(rows.map((r) => r.key)).toEqual(["chest", "triceps", "quads"]);
    expect(rows.every((r) => r.cycleSets === 0 && r.status === "none")).toBe(true);
  });

  it("ignores muscle keys that no longer exist in the catalog", () => {
    const withGhost = [
      day(1, "Hayalet", [
        { name: "Ghost row", muscles: [{ key: "ghost", load: 1 }], targetSets: 4, targetReps: 8, targetRIR: null, metric: "reps" },
      ]),
    ];
    const rows = templateVolume(withGhost, muscles);
    expect(rows.every((r) => r.cycleSets === 0)).toBe(true);
  });

  it("handles an empty day list without dividing by zero", () => {
    const rows = templateVolume([], muscles);
    expect(rows[0].weeklySets).toBe(0);
    expect(Number.isFinite(rows[0].weeklySets)).toBe(true);
  });
});

describe("volumeStatus", () => {
  it("marks nothing trained as none", () => {
    expect(volumeStatus(0, { min: 10, max: 20 })).toBe("none");
  });
  it("marks below the minimum as under", () => {
    expect(volumeStatus(6, { min: 10, max: 20 })).toBe("under");
  });
  it("marks inside the band as in", () => {
    expect(volumeStatus(12, { min: 10, max: 20 })).toBe("in");
    expect(volumeStatus(10, { min: 10, max: 20 })).toBe("in");
    expect(volumeStatus(20, { min: 10, max: 20 })).toBe("in");
  });
  it("marks above the maximum as over", () => {
    expect(volumeStatus(24, { min: 10, max: 20 })).toBe("over");
  });
  it("treats a missing minimum as zero", () => {
    expect(volumeStatus(3, { max: 18 })).toBe("in");
    expect(volumeStatus(19, { max: 18 })).toBe("over");
  });
});
