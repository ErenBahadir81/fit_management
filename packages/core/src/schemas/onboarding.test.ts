import { describe, expect, it } from "vitest";
import { zEnergy, zOnboardingInput, zRegisterInput } from "./index";

describe("C3 — register input", () => {
  const base = { username: "Eren", password: "coksaglam", displayName: "Eren" };

  it("lowercases the username and keeps the display name as typed", () => {
    const r = zRegisterInput.parse(base);
    expect(r.username).toBe("eren");
    expect(r.displayName).toBe("Eren");
    expect(r.email).toBeUndefined();
  });

  it("wants at least 8 characters of password", () => {
    expect(() => zRegisterInput.parse({ ...base, password: "1234567" })).toThrow();
    expect(zRegisterInput.parse({ ...base, password: "12345678" }).password).toBe("12345678");
  });

  it("accepts an optional email and normalizes it", () => {
    expect(zRegisterInput.parse({ ...base, email: " Eren@Example.COM " }).email).toBe("eren@example.com");
    expect(() => zRegisterInput.parse({ ...base, email: "not-an-email" })).toThrow();
  });

  it("rejects an empty display name", () => {
    expect(() => zRegisterInput.parse({ ...base, displayName: "   " })).toThrow();
  });
});

describe("C3 — onboarding input", () => {
  const body = {
    profile: { gender: "male", birthDate: "1996-04-12", heightCm: 180, activityLevel: "moderate", measurementDay: 0 },
    measurement: { weightKg: 88, neckCm: 39, waistCm: 92 },
    goal: { targetBodyFatPct: 15, profile: "optimal" },
  };

  it("parses the whole payload", () => {
    const p = zOnboardingInput.parse(body);
    expect(p.measurement.hipCm ?? null).toBeNull();
    expect(p.goal).toEqual({ targetBodyFatPct: 15, profile: "optimal" });
  });

  it("treats a missing goal as 'no goal yet'", () => {
    expect(zOnboardingInput.parse({ ...body, goal: null }).goal).toBeNull();
    expect(zOnboardingInput.parse({ profile: body.profile, measurement: body.measurement }).goal).toBeNull();
  });

  it("rejects impossible measurements rather than storing them", () => {
    expect(() => zOnboardingInput.parse({ ...body, measurement: { ...body.measurement, weightKg: 5 } })).toThrow();
    expect(() => zOnboardingInput.parse({ ...body, profile: { ...body.profile, heightCm: 40 } })).toThrow();
    expect(() => zOnboardingInput.parse({ ...body, profile: { ...body.profile, measurementDay: 7 } })).toThrow();
    expect(() => zOnboardingInput.parse({ ...body, profile: { ...body.profile, birthDate: "1996-02-30" } })).toThrow();
  });
});

describe("C3 — energy", () => {
  it("accepts a surplus (a negative daily deficit)", () => {
    const e = {
      bmr: 1800,
      tdee: 2790,
      maintenanceCalories: 2790,
      targetCalories: 3000,
      dailyDeficit: -210,
      derivedFrom: "goal" as const,
      activityLevel: "moderate" as const,
      activityMultiplier: 1.55,
      leanMassKg: 66.2,
    };
    expect(() => zEnergy.parse(e)).not.toThrow();
    expect(zEnergy.parse({ ...e, leanMassKg: null }).leanMassKg).toBeNull();
  });
});
