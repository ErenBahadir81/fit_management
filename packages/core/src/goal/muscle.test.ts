import { describe, expect, it } from "vitest";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import {
  WEEKS_PER_MONTH,
  ffmiTaper,
  inferTrainingLevel,
  levelAfterWeeks,
  muscleGainRate,
  recompLeanRate,
  type MuscleRateInput,
} from "./muscle";

const S = DEFAULT_GOAL_SETTINGS;
const M = S.muscle;

const man = (over: Partial<MuscleRateInput> = {}): MuscleRateInput => ({
  sex: "male",
  weightKg: 80,
  ffmi: 20, // well below the taper window (22..25)
  level: "beginner",
  settings: S,
  ...over,
});

describe("muscleGainRate — literature rates", () => {
  it.each([
    ["beginner", 0.92],
    ["intermediate", 0.48],
    ["advanced", 0.24],
  ] as const)("80 kg man, %s ≈ %s kg lean per month", (level, perMonth) => {
    const r = muscleGainRate(man({ level }));
    expect(r.taper).toBe(1);
    expect(r.leanKgPerWeek * WEEKS_PER_MONTH).toBeCloseTo(perMonth, 3);
  });

  it("fat comes with the lean at the level's ratio, and the surplus pays for both", () => {
    const r = muscleGainRate(man());
    expect(r.fatKgPerWeek).toBeCloseTo(r.leanKgPerWeek * M.fatPerLeanKg.beginner, 8);
    expect(r.weeklySurplusKcal).toBeCloseTo(r.leanKgPerWeek * 2500 + r.fatKgPerWeek * 7700, 6);
    // ≈ 1,670 kcal/week ≈ 240 kcal/day — the lean-bulk surplus range the literature gives
    expect(r.weeklySurplusKcal / 7).toBeGreaterThan(150);
    expect(r.weeklySurplusKcal / 7).toBeLessThan(400);
  });

  it("rate scales with bodyweight", () => {
    const a = muscleGainRate(man({ weightKg: 60 }));
    const b = muscleGainRate(man({ weightKg: 90 }));
    expect(b.leanKgPerWeek / a.leanKgPerWeek).toBeCloseTo(1.5, 8);
  });

  it("women get the female factor on the %BW rate", () => {
    const f = muscleGainRate(man({ sex: "female", ffmi: 15 }));
    const m = muscleGainRate(man());
    expect(f.taper).toBe(1);
    expect(f.leanKgPerWeek / m.leanKgPerWeek).toBeCloseTo(M.femaleRateFactor, 8);
  });

  it("profiles: conservative < optimal < aggressive on lean and on fat", () => {
    const c = muscleGainRate(man({ profile: "conservative" }));
    const o = muscleGainRate(man({ profile: "optimal" }));
    const a = muscleGainRate(man({ profile: "aggressive" }));
    expect(c.leanKgPerWeek).toBeLessThan(o.leanKgPerWeek);
    expect(o.leanKgPerWeek).toBeLessThan(a.leanKgPerWeek);
    expect(c.fatKgPerWeek).toBeLessThan(o.fatKgPerWeek);
    expect(o.fatKgPerWeek).toBeLessThan(a.fatKgPerWeek);
    // A bigger surplus buys proportionally more fat than muscle.
    expect(a.fatKgPerWeek / a.leanKgPerWeek).toBeGreaterThan(o.fatKgPerWeek / o.leanKgPerWeek);
    expect(c.weeklySurplusKcal).toBeLessThan(o.weeklySurplusKcal);
    expect(o.weeklySurplusKcal).toBeLessThan(a.weeklySurplusKcal);
  });

  it("defaults to the optimal profile", () => {
    expect(muscleGainRate(man())).toEqual(muscleGainRate(man({ profile: "optimal" })));
  });

  it("near the ceiling lean gain drops and the fat share rises", () => {
    const far = muscleGainRate(man({ ffmi: 20 }));
    const near = muscleGainRate(man({ ffmi: 24 }));
    expect(near.taper).toBeLessThan(1);
    expect(near.leanKgPerWeek).toBeCloseTo(far.leanKgPerWeek * near.taper, 8);
    expect(near.fatKgPerWeek / near.leanKgPerWeek).toBeGreaterThan(far.fatKgPerWeek / far.leanKgPerWeek);
  });

  it("never negative, finite for zero weight", () => {
    const r = muscleGainRate(man({ weightKg: 0 }));
    expect(r.leanKgPerWeek).toBe(0);
    expect(r.fatKgPerWeek).toBe(0);
    expect(Number.isFinite(r.weeklySurplusKcal)).toBe(true);
  });
});

describe("ffmiTaper", () => {
  it("is 1 up to ceiling − window, taperFloor at and beyond the ceiling", () => {
    const start = M.ffmiCeiling.male - M.ffmiTaperWindow; // 22
    expect(ffmiTaper("male", 15, S)).toBe(1);
    expect(ffmiTaper("male", start, S)).toBe(1);
    expect(ffmiTaper("male", M.ffmiCeiling.male, S)).toBeCloseTo(M.taperFloor, 10);
    expect(ffmiTaper("male", 30, S)).toBeCloseTo(M.taperFloor, 10);
    // half-way through the window: 1 − 0.5 × (1 − 0.15) = 0.575
    expect(ffmiTaper("male", start + M.ffmiTaperWindow / 2, S)).toBeCloseTo(0.575, 10);
  });

  it("uses the female ceiling for women", () => {
    expect(ffmiTaper("female", 18.5, S)).toBe(1);
    expect(ffmiTaper("female", 21.5, S)).toBeCloseTo(M.taperFloor, 10);
    expect(ffmiTaper("female", 20, S)).toBeCloseTo(0.575, 10);
  });

  it("is monotonic non-increasing", () => {
    let prev = Infinity;
    for (let v = 15; v <= 28; v += 0.25) {
      const t = ffmiTaper("male", v, S);
      expect(t).toBeLessThanOrEqual(prev);
      expect(t).toBeGreaterThanOrEqual(M.taperFloor);
      expect(t).toBeLessThanOrEqual(1);
      prev = t;
    }
  });
});

describe("levelAfterWeeks", () => {
  it("steps one level per 52 weeks, capped at advanced", () => {
    expect(levelAfterWeeks("beginner", 0)).toBe("beginner");
    expect(levelAfterWeeks("beginner", 51)).toBe("beginner");
    expect(levelAfterWeeks("beginner", 52)).toBe("intermediate");
    expect(levelAfterWeeks("beginner", 103)).toBe("intermediate");
    expect(levelAfterWeeks("beginner", 104)).toBe("advanced");
    expect(levelAfterWeeks("beginner", 1000)).toBe("advanced");
    expect(levelAfterWeeks("intermediate", 52)).toBe("advanced");
    expect(levelAfterWeeks("advanced", 52)).toBe("advanced");
  });

  it("negative weeks do not go backwards", () => {
    expect(levelAfterWeeks("intermediate", -100)).toBe("intermediate");
  });
});

describe("inferTrainingLevel", () => {
  it("men: < 20 beginner · 20 intermediate · 22.5 advanced", () => {
    expect(inferTrainingLevel("male", 19.99, S)).toBe("beginner");
    expect(inferTrainingLevel("male", 20, S)).toBe("intermediate");
    expect(inferTrainingLevel("male", 22.49, S)).toBe("intermediate");
    expect(inferTrainingLevel("male", 22.5, S)).toBe("advanced");
  });

  it("women: < 16.5 beginner · 16.5 intermediate · 19 advanced", () => {
    expect(inferTrainingLevel("female", 16.4, S)).toBe("beginner");
    expect(inferTrainingLevel("female", 16.5, S)).toBe("intermediate");
    expect(inferTrainingLevel("female", 19, S)).toBe("advanced");
  });
});

describe("recompLeanRate", () => {
  it("is the optimal bulk rate × the level's recomp factor", () => {
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      const bulk = muscleGainRate(man({ level, profile: "optimal" })).leanKgPerWeek;
      expect(recompLeanRate({ sex: "male", weightKg: 80, ffmi: 20, level, settings: S })).toBeCloseTo(bulk * M.recompLeanFactor[level], 10);
    }
  });

  it("is slower than a bulk", () => {
    const bulk = muscleGainRate(man()).leanKgPerWeek;
    expect(recompLeanRate({ sex: "male", weightKg: 80, ffmi: 20, level: "beginner", settings: S })).toBeLessThan(bulk);
  });
});
