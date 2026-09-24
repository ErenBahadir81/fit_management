import { describe, expect, it } from "vitest";
import { DEFAULT_GOAL_SETTINGS } from "../schemas/settings";
import { zBodyAssessment, zGoalRecommendation } from "../schemas/assessment";
import type { Gender } from "../schemas/common";
import type { TrainingLevel } from "../schemas/goal";
import { assessBody, pctToTr, recommendGoal, type AssessmentInput } from "./assessment";
import { ffmi } from "./ffmi";

const S = DEFAULT_GOAL_SETTINGS;

const person = (sex: Gender, weightKg: number, heightCm: number, bodyFatPct: number, trainingLevel?: TrainingLevel): AssessmentInput => ({
  sex,
  weightKg,
  heightCm,
  bodyFatPct,
  trainingLevel: trainingLevel ?? null,
  settings: S,
});

const ffmiOf = (p: AssessmentInput) => ffmi(p.weightKg * (1 - p.bodyFatPct / 100), p.heightCm);

describe("recommendGoal — men", () => {
  it("≥ 25 % → cut, first cut limited to 10 points and not below 15 %", () => {
    const r = recommendGoal(person("male", 100, 180, 30));
    expect(r.direction).toBe("cut");
    expect(r.targetBodyFatPct).toBe(20);
    expect(r.targetLeanGainKg).toBeNull();
    expect(r.alternatives).toEqual(["recomp"]);
    expect(recommendGoal(person("male", 90, 180, 25)).direction).toBe("cut"); // exactly on the edge
    expect(recommendGoal(person("male", 90, 180, 25)).targetBodyFatPct).toBe(15);
  });

  it("20–25 %, beginner with low FFMI → recomp to 15 %", () => {
    const p = person("male", 75, 180, 22); // lean 58.5 → FFMI ≈ 18.1 (average), inferred beginner
    expect(ffmiOf(p)).toBeCloseTo(18.06, 1);
    const r = recommendGoal(p);
    expect(r.direction).toBe("recomp");
    expect(r.targetBodyFatPct).toBe(15);
    expect(r.alternatives).toEqual(["cut"]);
    expect(r.reasonTr).toContain("FFMI");
  });

  it("20–25 %, same body but trained (intermediate) → cut", () => {
    const r = recommendGoal(person("male", 75, 180, 22, "intermediate"));
    expect(r.direction).toBe("cut");
    expect(r.targetBodyFatPct).toBe(15);
  });

  it("20–25 % with a good FFMI → cut", () => {
    const p = person("male", 90, 180, 22); // FFMI ≈ 21.7
    expect(recommendGoal(p).direction).toBe("cut");
    expect(recommendGoal(person("male", 90, 180, 20)).direction).toBe("cut"); // exactly 20 is in this band
  });

  it("15–20 % with low FFMI → recomp (bulk as alternative), target max(12, bf − 4)", () => {
    const p = person("male", 70, 180, 17); // lean 58.1 → FFMI ≈ 17.9 (low)
    expect(ffmiOf(p)).toBeLessThan(18);
    const r = recommendGoal(p);
    expect(r.direction).toBe("recomp");
    expect(r.targetBodyFatPct).toBe(13);
    expect(r.alternatives).toEqual(["bulk", "cut"]);
    expect(r.reasonTr).toContain("kas kazanmak kritik");
  });

  it("15–20 % with a good FFMI → mini cut to 12 %", () => {
    const r = recommendGoal(person("male", 85, 180, 17)); // FFMI ≈ 21.8
    expect(r.direction).toBe("cut");
    expect(r.targetBodyFatPct).toBe(12);
    expect(r.reasonTr).toContain("%12'ye");
    expect(recommendGoal(person("male", 85, 180, 15)).direction).toBe("cut"); // 15 is not lean-bulk territory yet
  });

  it("< 15 % → lean bulk with a lean-gain target rounded to 0.5 kg", () => {
    const r = recommendGoal(person("male", 75, 180, 12)); // FFMI ≈ 20.4 → inferred intermediate
    expect(r.direction).toBe("bulk");
    expect(r.targetBodyFatPct).toBeNull();
    // 75 kg × 0.6 %/month / 4.345 × 20 weeks ≈ 2.07 → 2.0
    expect(r.targetLeanGainKg).toBe(2);
    expect((r.targetLeanGainKg! * 2) % 1).toBe(0);
    expect(r.alternatives).toEqual(["recomp"]);
  });

  it("< 15 % beginner gets a bigger bulk target than an advanced lifter", () => {
    const beginner = recommendGoal(person("male", 75, 180, 12, "beginner"));
    const advanced = recommendGoal(person("male", 75, 180, 12, "advanced"));
    expect(beginner.targetLeanGainKg!).toBeGreaterThan(advanced.targetLeanGainKg!);
    expect(advanced.targetLeanGainKg!).toBeGreaterThanOrEqual(0.5);
  });

  it("< 15 % near the natural FFMI limit → recomp below current body fat", () => {
    const p = person("male", 100, 180, 12); // lean 88 → FFMI ≈ 27
    const r = recommendGoal(p);
    expect(r.direction).toBe("recomp");
    expect(r.targetBodyFatPct).toBe(10);
    expect(r.targetBodyFatPct!).toBeLessThan(12);
    expect(r.alternatives).toEqual(["bulk"]);
  });
});

describe("recommendGoal — women (+8 points)", () => {
  it("≥ 33 % → cut, not below 23 %", () => {
    const r = recommendGoal(person("female", 70, 165, 35));
    expect(r.direction).toBe("cut");
    expect(r.targetBodyFatPct).toBe(25);
    expect(recommendGoal(person("female", 90, 165, 38)).targetBodyFatPct).toBe(28);
  });

  it("28–33 %, beginner with low FFMI → recomp to 23 %", () => {
    const r = recommendGoal(person("female", 60, 165, 30)); // FFMI ≈ 16.3 average, beginner
    expect(r.direction).toBe("recomp");
    expect(r.targetBodyFatPct).toBe(23);
  });

  it("28 % on a man would be cut; on a woman it is the 28–33 band, not ≥ 33", () => {
    expect(recommendGoal(person("female", 70, 165, 28, "intermediate")).direction).toBe("cut");
    expect(recommendGoal(person("female", 70, 165, 28, "intermediate")).targetBodyFatPct).toBe(23);
  });

  it("23–28 % with low FFMI → recomp, target max(20, bf − 4)", () => {
    const r = recommendGoal(person("female", 55, 165, 25)); // FFMI ≈ 16.1, beginner
    expect(r.direction).toBe("recomp");
    expect(r.targetBodyFatPct).toBe(21);
  });

  it("23–28 % with a good FFMI → mini cut to 20 %", () => {
    const r = recommendGoal(person("female", 65, 165, 25)); // FFMI ≈ 18.8
    expect(r.direction).toBe("cut");
    expect(r.targetBodyFatPct).toBe(20);
    expect(r.reasonTr).toContain("%20'ye");
  });

  it("< 23 % → lean bulk; the same numbers on a man are a mini cut", () => {
    const r = recommendGoal(person("female", 60, 165, 20));
    expect(r.direction).toBe("bulk");
    expect(r.targetLeanGainKg!).toBeGreaterThanOrEqual(0.5);
    expect((r.targetLeanGainKg! * 2) % 1).toBe(0);
  });

  it("< 23 % near the female ceiling → recomp", () => {
    const r = recommendGoal(person("female", 72, 165, 18)); // lean 59 → FFMI ≈ 22.6
    expect(r.direction).toBe("recomp");
    expect(r.targetBodyFatPct!).toBeLessThan(18);
  });
});

describe("recommendGoal — output is schema valid for a sweep", () => {
  it("every combination parses and cut/recomp have a target below current, bulk a lean target", () => {
    for (const sex of ["male", "female"] as const) {
      for (const bf of [8, 12, 15, 17, 20, 22, 25, 28, 30, 35, 42]) {
        for (const w of [50, 65, 80, 100]) {
          const r = recommendGoal(person(sex, w, 172, bf));
          expect(() => zGoalRecommendation.parse(r)).not.toThrow();
          if (r.direction === "bulk") expect(r.targetLeanGainKg!).toBeGreaterThan(0);
          else expect(r.targetBodyFatPct!).toBeLessThan(bf);
        }
      }
    }
  });
});

describe("assessBody", () => {
  it("fills composition, FFMI and the recommendation", () => {
    const a = assessBody(person("male", 80, 180, 20));
    expect(a.leanMassKg).toBeCloseTo(64, 2);
    expect(a.fatMassKg).toBeCloseTo(16, 2);
    expect(a.ffmiRaw).toBeCloseTo(19.8, 1);
    expect(a.ffmi).toBeCloseTo(19.8, 1);
    expect(a.ffmiBand).toBe("average");
    expect(a.ffmiBandTr).toBe("Ortalama");
    expect(a.ffmiCeiling).toBe(25);
    expect(a.ffmiGauge).toBeGreaterThanOrEqual(0);
    expect(a.ffmiGauge).toBeLessThanOrEqual(100);
    // 25 × 3.24 = 81 kg lean at the ceiling → 17 kg to go
    expect(a.leanToCeilingKg).toBeCloseTo(17, 1);
    expect(a.trainingLevel).toBe("beginner");
    expect(a.trainingLevelInferred).toBe(true);
    expect(a.summaryTr).toContain("FFMI");
    expect(a.summaryTr).toContain("19,8");
    expect(a.recommendation.direction).toBe(recommendGoal(person("male", 80, 180, 20)).direction);
    expect(() => zBodyAssessment.parse(a)).not.toThrow();
  });

  it("a stated level is kept and not flagged inferred", () => {
    const a = assessBody(person("male", 80, 180, 20, "advanced"));
    expect(a.trainingLevel).toBe("advanced");
    expect(a.trainingLevelInferred).toBe(false);
  });

  it("leanToCeilingKg is never negative above the ceiling", () => {
    const a = assessBody(person("male", 110, 175, 10));
    expect(a.ffmi).toBeGreaterThan(25);
    expect(a.ffmiBand).toBe("nearLimit");
    expect(a.leanToCeilingKg).toBe(0);
    expect(a.ffmiGauge).toBe(100);
  });

  it("women use the female ceiling", () => {
    const a = assessBody(person("female", 60, 165, 25));
    expect(a.ffmiCeiling).toBe(21.5);
    expect(a.summaryTr).toContain("FFMI");
  });
});

describe("pctToTr — Turkish dative suffix", () => {
  it.each([
    [15, "%15'e"],
    [12, "%12'ye"],
    [20, "%20'ye"],
    [9, "%9'a"],
    [30, "%30'a"],
    [6, "%6'ya"],
    [10, "%10'a"],
    [23, "%23'e"],
    [27, "%27'ye"],
    [40, "%40'a"],
    [50, "%50'ye"],
    [100, "%100'e"],
    [0, "%0'a"],
  ])("%s → %s", (n, s) => {
    expect(pctToTr(n)).toBe(s);
  });

  it("rounds to a whole number first", () => {
    expect(pctToTr(14.6)).toBe("%15'e");
  });
});
