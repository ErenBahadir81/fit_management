import { describe, expect, it } from "vitest";
import { FFMI_BAND_EDGES, ffmi, ffmiBand, ffmiGauge, ffmiRaw, leanMassForFfmi } from "./ffmi";

describe("ffmi — Kouri 1995 formula", () => {
  it("70 kg lean at 180 cm → 21.6; normalised equals raw at the 1.80 m reference", () => {
    expect(ffmiRaw(70, 180)).toBeCloseTo(21.605, 3);
    expect(ffmi(70, 180)).toBeCloseTo(ffmiRaw(70, 180), 10);
  });

  it("taller people get a downward height correction, shorter an upward one", () => {
    // 70 / 1.86² = 20.234; + 6.1 × (1.80 − 1.86) = −0.366 → 19.868
    expect(ffmiRaw(70, 186)).toBeCloseTo(20.234, 3);
    expect(ffmi(70, 186)).toBeCloseTo(19.868, 3);
    // 60 / 1.70² = 20.761; + 6.1 × 0.10 = +0.61 → 21.371
    expect(ffmi(60, 170)).toBeCloseTo(21.371, 3);
    expect(ffmi(60, 170)).toBeGreaterThan(ffmiRaw(60, 170));
  });

  it("returns 0 (not Infinity/NaN) for a zero or negative height or lean mass", () => {
    expect(ffmiRaw(70, 0)).toBe(0);
    expect(ffmiRaw(70, -170)).toBe(0);
    expect(ffmi(70, 0)).toBe(0);
    expect(ffmi(70, -10)).toBe(0);
    expect(ffmi(0, 180)).toBe(0);
    expect(ffmi(-5, 180)).toBe(0);
    expect(leanMassForFfmi(22, 0)).toBe(0);
    expect(leanMassForFfmi(22, -180)).toBe(0);
  });
});

describe("leanMassForFfmi — inverse", () => {
  it.each([
    [18, 165],
    [21.5, 180],
    [25, 192],
    [16, 158],
  ])("round-trips FFMI %s at %s cm", (target, height) => {
    const lean = leanMassForFfmi(target, height);
    expect(lean).toBeGreaterThan(0);
    expect(ffmi(lean, height)).toBeCloseTo(target, 8);
  });

  it("is the plain FFMI × h² at the reference height", () => {
    expect(leanMassForFfmi(25, 180)).toBeCloseTo(81, 8);
  });

  it("never returns negative lean mass", () => {
    expect(leanMassForFfmi(-3, 180)).toBe(0);
  });
});

describe("ffmiBand", () => {
  const bands = ["low", "average", "good", "advanced", "nearLimit"] as const;

  it.each(["male", "female"] as const)("%s: a value exactly on an edge belongs to the upper band", (sex) => {
    const edges = FFMI_BAND_EDGES[sex];
    edges.forEach((edge, i) => {
      expect(ffmiBand(sex, edge)).toBe(bands[i + 1]);
      expect(ffmiBand(sex, edge - 0.01)).toBe(bands[i]);
    });
  });

  it("men: 17.9 low · 19 average · 21 good · 24 advanced · 26 near limit", () => {
    expect(ffmiBand("male", 17.9)).toBe("low");
    expect(ffmiBand("male", 19)).toBe("average");
    expect(ffmiBand("male", 21)).toBe("good");
    expect(ffmiBand("male", 24)).toBe("advanced");
    expect(ffmiBand("male", 26)).toBe("nearLimit");
  });

  it("women sit ~3.5 points below men: the same FFMI reads higher", () => {
    expect(ffmiBand("female", 14)).toBe("low");
    expect(ffmiBand("female", 15)).toBe("average");
    expect(ffmiBand("female", 17)).toBe("good");
    expect(ffmiBand("female", 20)).toBe("advanced");
    expect(ffmiBand("female", 21.5)).toBe("nearLimit");
    expect(ffmiBand("female", 19)).toBe("advanced");
    expect(ffmiBand("male", 19)).toBe("average");
  });
});

describe("ffmiGauge", () => {
  it("maps (low edge − 3) → 0 and the ceiling → 100, linear in between", () => {
    // men: floor 15, ceiling 25
    expect(ffmiGauge("male", 15, 25)).toBe(0);
    expect(ffmiGauge("male", 20, 25)).toBe(50);
    expect(ffmiGauge("male", 25, 25)).toBe(100);
    // women: floor 11.5, ceiling 21.5
    expect(ffmiGauge("female", 16.5, 21.5)).toBe(50);
  });

  it("clamps to 0..100", () => {
    expect(ffmiGauge("male", 5, 25)).toBe(0);
    expect(ffmiGauge("male", 0, 25)).toBe(0);
    expect(ffmiGauge("male", 30, 25)).toBe(100);
    expect(ffmiGauge("female", 40, 21.5)).toBe(100);
  });

  it("a ceiling at or below the floor yields 0 rather than dividing by zero", () => {
    expect(ffmiGauge("male", 20, 15)).toBe(0);
    expect(ffmiGauge("male", 20, 10)).toBe(0);
  });

  it("is monotonic", () => {
    let prev = -1;
    for (let v = 10; v <= 28; v += 0.5) {
      const g = ffmiGauge("male", v, 25);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
  });
});
