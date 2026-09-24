import { describe, expect, it } from "vitest";
import { zOnboardingInput, zProgramInput } from "../schemas/index";
import { STARTER_EXERCISE_NAMES, starterProgram, trainingLevelForExperience } from "./starter";
import { normalizeProgramInput } from "./program";

describe("trainingLevelForExperience", () => {
  it("maps the onboarding answer to the goal engine's level", () => {
    expect(trainingLevelForExperience("none")).toBe("beginner");
    expect(trainingLevelForExperience("under1")).toBe("beginner");
    expect(trainingLevelForExperience("oneToThree")).toBe("intermediate");
    expect(trainingLevelForExperience("overThree")).toBe("advanced");
  });
});

describe("starterProgram", () => {
  const levels = ["beginner", "intermediate", "advanced"] as const;

  it("is a 7-day cycle with exactly the asked-for number of training days", () => {
    for (let n = 2; n <= 6; n++) {
      for (const level of levels) {
        const p = starterProgram({ daysPerWeek: n, level });
        expect(p.mode).toBe("cycle");
        expect(p.days).toHaveLength(7);
        expect(p.days.filter((d) => d.kind === "strength")).toHaveLength(n);
        expect(p.days.filter((d) => d.kind === "rest")).toHaveLength(7 - n);
        expect(p.days.map((d) => d.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      }
    }
  });

  it("never puts two rest days first and spreads training through the week", () => {
    for (let n = 2; n <= 6; n++) {
      const kinds = starterProgram({ daysPerWeek: n, level: "beginner" }).days.map((d) => d.kind);
      expect(kinds[0]).toBe("strength");
      // No more than two training days in a row below five days a week.
      if (n <= 4) expect(kinds.join(",")).not.toMatch(/strength,strength,strength/);
    }
  });

  it("is a valid program input the API's normalizer accepts against the seed catalog names", () => {
    const catalog = STARTER_EXERCISE_NAMES.map((name) => ({ name, muscles: [{ key: "chest", load: 1 }], metric: "reps" }));
    for (let n = 2; n <= 6; n++) {
      for (const level of levels) {
        const p = starterProgram({ daysPerWeek: n, level });
        expect(() => zProgramInput.parse(p)).not.toThrow();
        const { errors } = normalizeProgramInput(p.days, catalog, { mode: "cycle" });
        expect(errors).toEqual([]);
      }
    }
  });

  it("gives more volume and harder variations to a more experienced lifter", () => {
    const sets = (level: (typeof levels)[number]) =>
      starterProgram({ daysPerWeek: 3, level }).days.flatMap((d) => d.exercises).reduce((s, e) => s + (e.targetSets ?? 0), 0);
    expect(sets("beginner")).toBeLessThan(sets("intermediate"));
    expect(sets("intermediate")).toBeLessThanOrEqual(sets("advanced"));
    const names = (level: (typeof levels)[number]) => starterProgram({ daysPerWeek: 4, level }).days.flatMap((d) => d.exercises.map((e) => e.name));
    expect(names("beginner")).not.toContain("HSPU");
    expect(names("advanced")).toContain("HSPU");
  });

  it("names the split in Turkish so the finish screen can say what was set up", () => {
    expect(starterProgram({ daysPerWeek: 2, level: "beginner" }).name).toMatch(/Tüm Vücut/);
    expect(starterProgram({ daysPerWeek: 4, level: "beginner" }).name).toMatch(/Üst \/ Alt/);
    expect(starterProgram({ daysPerWeek: 6, level: "beginner" }).name).toMatch(/İt \/ Çek \/ Bacak/);
  });

  it("clamps an out-of-range day count instead of producing an empty week", () => {
    expect(starterProgram({ daysPerWeek: 0, level: "beginner" }).days.filter((d) => d.kind === "strength")).toHaveLength(2);
    expect(starterProgram({ daysPerWeek: 9, level: "beginner" }).days.filter((d) => d.kind === "strength")).toHaveLength(6);
  });
});

describe("onboarding input (T8 additions)", () => {
  const body = {
    profile: { gender: "male", birthDate: "1996-04-12", heightCm: 180, activityLevel: "moderate", measurementDay: 0 },
    measurement: { weightKg: 88, neckCm: 39, waistCm: 92 },
  };

  it("training is optional, so older clients are unchanged", () => {
    expect(zOnboardingInput.parse(body).training ?? null).toBeNull();
  });

  it("accepts 2-6 training days and a known experience", () => {
    expect(zOnboardingInput.parse({ ...body, training: { daysPerWeek: 3, experience: "under1" } }).training).toEqual({ daysPerWeek: 3, experience: "under1" });
    expect(() => zOnboardingInput.parse({ ...body, training: { daysPerWeek: 1, experience: "none" } })).toThrow();
    expect(() => zOnboardingInput.parse({ ...body, training: { daysPerWeek: 3, experience: "years" } })).toThrow();
  });

  it("carries every goal direction through (bulk needs a lean target, recomp a body-fat target)", () => {
    expect(zOnboardingInput.parse({ ...body, goal: { direction: "bulk", targetLeanGainKg: 3, trainingLevel: "beginner", profile: "optimal" } }).goal).toMatchObject({ direction: "bulk" });
    expect(() => zOnboardingInput.parse({ ...body, goal: { direction: "bulk", profile: "optimal" } })).toThrow();
    expect(() => zOnboardingInput.parse({ ...body, goal: { direction: "recomp", profile: "optimal" } })).toThrow();
  });
});
