import { describe, expect, it } from "vitest";
import { entryTonnageKg, logTonnageKg, setVolumeKg } from "./tonnage";

describe("tonnage", () => {
  it("a set's volume is reps × weightKg", () => {
    expect(setVolumeKg({ reps: 8, rir: 2, weightKg: 60 })).toBe(480);
    expect(setVolumeKg({ reps: 12, rir: null, weightKg: 22.5 })).toBe(270);
  });

  it("a set with no recorded load contributes nothing (missing is null, never 0 kg)", () => {
    expect(setVolumeKg({ reps: 10, rir: 2 })).toBe(0);
    expect(setVolumeKg({ reps: 10, rir: 2, weightKg: null })).toBe(0);
    expect(setVolumeKg({ reps: 10, rir: 2, weightKg: 0 })).toBe(0);
  });

  it("ignores garbage instead of throwing", () => {
    expect(setVolumeKg(null as never)).toBe(0);
    expect(setVolumeKg({ reps: Number.NaN, weightKg: 40 })).toBe(0);
    expect(setVolumeKg({ reps: 8, weightKg: -40 })).toBe(0);
  });

  it("sums an exercise's sets", () => {
    const entry = {
      name: "Bench Press",
      sets: [
        { reps: 8, rir: 2, weightKg: 60 },
        { reps: 8, rir: 1, weightKg: 62.5 },
        { reps: 6, rir: 0, weightKg: 65 },
      ],
    };
    expect(entryTonnageKg(entry)).toBe(1370);
  });

  it("counts an old log's un-weighted sets as zero tonnage rather than crashing", () => {
    const legacy = { name: "Bench Press", sets: [{ reps: 8, rir: 2 }, { reps: 8, rir: 2 }] };
    expect(entryTonnageKg(legacy)).toBe(0);
    expect(entryTonnageKg({ name: "Bench Press" })).toBe(0);
  });

  it("excludes skipped and mobility entries, exactly like loggedSets", () => {
    expect(entryTonnageKg({ name: "Squat", skipped: true, sets: [{ reps: 5, weightKg: 100 }] })).toBe(0);
    expect(entryTonnageKg({ name: "Hamstring stretch", metric: "stretch", sets: [{ reps: 30, weightKg: 5 }] })).toBe(0);
  });

  it("sums a whole log", () => {
    const log = {
      date: "2026-09-10T18:00:00.000Z",
      strength: [
        { name: "Squat", sets: [{ reps: 5, weightKg: 100 }, { reps: 5, weightKg: 100 }] },
        { name: "Curl", sets: [{ reps: 12, weightKg: 15 }] },
        { name: "Pull-up", sets: [{ reps: 8, rir: 1 }] },
      ],
    };
    expect(logTonnageKg(log)).toBe(1180);
    expect(logTonnageKg({ date: "2026-09-10T18:00:00.000Z" })).toBe(0);
  });
});
