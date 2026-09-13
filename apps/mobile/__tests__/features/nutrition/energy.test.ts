import type { EnergyDTO } from "@fitfloow/core";
import { energyRows, explainEnergy } from "../../../src/features/nutrition/energyCopy";

const base: EnergyDTO = {
  bmr: 1720,
  tdee: 2666,
  maintenanceCalories: 2666,
  targetCalories: 2180,
  dailyDeficit: 486,
  derivedFrom: "goal",
  activityLevel: "moderate",
  activityMultiplier: 1.55,
  leanMassKg: 69.9,
};

describe("explainEnergy", () => {
  test("says where the target came from, in a sentence, per source", () => {
    expect(explainEnergy(base).body).toMatch(/hedef/i);
    expect(explainEnergy({ ...base, derivedFrom: "maintenance", targetCalories: 2666, dailyDeficit: 0 }).body).toMatch(/ölçüm/i);
    expect(explainEnergy({ ...base, derivedFrom: "default", leanMassKg: null }).body).toMatch(/varsayılan/i);
  });

  test("each source names itself in one or two words for the chip", () => {
    expect(explainEnergy(base).source).toBe("Hedefinden");
    expect(explainEnergy({ ...base, derivedFrom: "maintenance" }).source).toBe("Ölçümünden");
    expect(explainEnergy({ ...base, derivedFrom: "default" }).source).toBe("Varsayılan");
  });

  test("an offer to fix it only appears when there is something to fix", () => {
    expect(explainEnergy(base).action).toBeNull();
    expect(explainEnergy({ ...base, derivedFrom: "maintenance" }).action).toBe("goal");
    expect(explainEnergy({ ...base, derivedFrom: "default" }).action).toBe("measure");
  });

  test("no exclamation marks, no shaming", () => {
    for (const from of ["goal", "maintenance", "default"] as const) {
      const e = explainEnergy({ ...base, derivedFrom: from });
      expect(e.body).not.toMatch(/[!]/);
      expect(e.body.length).toBeGreaterThan(20);
    }
  });
});

describe("energyRows", () => {
  test("BMR, maintenance and the gap between maintenance and target", () => {
    const rows = energyRows(base);
    expect(rows.map((r) => r.key)).toEqual(["bmr", "maintenance", "delta"]);
    expect(rows[0].value).toBe(1720);
    expect(rows[1].value).toBe(2666);
    expect(rows[2].value).toBe(486);
  });

  test("a surplus is labelled as a surplus, not a negative deficit", () => {
    const bulk = { ...base, targetCalories: 2950, dailyDeficit: -284 };
    const rows = energyRows(bulk);
    expect(rows[2].label).toMatch(/fazla/i);
    expect(rows[2].value).toBe(284);
    expect(rows[2].tone).toBe("primary");
  });

  test("the sign says which way the number goes: down for a deficit, up for a surplus, none otherwise", () => {
    expect(energyRows(base)[2].sign).toBe("−");
    expect(energyRows({ ...base, dailyDeficit: -284 })[2].sign).toBe("+");
    expect(energyRows({ ...base, dailyDeficit: 0 })[2].sign).toBe("");
    for (const r of energyRows(base).slice(0, 2)) expect(r.sign).toBe("");
  });

  test("no gap at all reads as maintenance, not as a zero", () => {
    const rows = energyRows({ ...base, targetCalories: 2666, dailyDeficit: 0 });
    expect(rows[2].label).toMatch(/koruma/i);
    expect(rows[2].value).toBe(0);
  });
});
