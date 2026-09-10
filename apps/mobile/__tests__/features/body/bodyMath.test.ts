import { navyBodyFat, bodyComposition, type BodyTrends, type BodySummary } from "@fitfloow/core";
import { BF_UNCERTAINTY, measurementError, navyPreview, optimisticSummary, optimisticTrends, trendPoints, weighInDefault, RANGES } from "../../../src/features/body/bodyMath";

const draft = { gender: "male" as const, heightCm: 180, neckCm: 39, waistCm: 92, hipCm: null, weightKg: 84 };

describe("navyPreview (live Navy preview)", () => {
  test("matches core navyBodyFat + bodyComposition for a male draft", () => {
    const p = navyPreview(draft);
    const bf = navyBodyFat({ gender: "male", heightCm: 180, neckCm: 39, waistCm: 92, hipCm: null })!;
    const comp = bodyComposition(84, bf);
    expect(p.bodyFatPct).toBe(bf);
    expect(p.fatMassKg).toBe(comp.fatMassKg);
    expect(p.leanMassKg).toBe(comp.leanMassKg);
    expect(p.category).toBe("average");
    expect(p.categoryLabel).toBe("Ortalama");
    expect(p.error).toBeNull();
    expect(BF_UNCERTAINTY).toBe(3.5);
  });

  test("female needs the hip measurement; with it the formula uses waist + hip − neck", () => {
    const f = { ...draft, gender: "female" as const, heightCm: 165, neckCm: 32, waistCm: 74, weightKg: 60 };
    expect(navyPreview({ ...f, hipCm: null }).error).toMatch(/kalça/i);
    const p = navyPreview({ ...f, hipCm: 96 });
    expect(p.error).toBeNull();
    expect(p.bodyFatPct).toBe(navyBodyFat({ gender: "female", heightCm: 165, neckCm: 32, waistCm: 74, hipCm: 96 }));
  });

  test("waist must exceed neck — validation copy says so and no numbers are shown", () => {
    expect(measurementError({ ...draft, waistCm: 39 })).toMatch(/bel.*boyun/i);
    expect(measurementError({ ...draft, waistCm: 38 })).toMatch(/bel.*boyun/i);
    const p = navyPreview({ ...draft, waistCm: 39 });
    expect(p.bodyFatPct).toBeNull();
    expect(p.error).toMatch(/bel.*boyun/i);
  });

  test("out-of-range inputs are rejected with the schema bounds", () => {
    expect(measurementError({ ...draft, heightCm: 90 })).toMatch(/boy/i);
    expect(measurementError({ ...draft, weightKg: 10 })).toMatch(/kilo/i);
    expect(measurementError(draft)).toBeNull();
  });
});

describe("trend helpers", () => {
  const trends: BodyTrends = {
    points: [
      { dateKey: "2026-08-08", weightKg: 81.2, weightEwma: 81.2, bodyFatPct: null, leanMassKg: null, waistCm: null },
      { dateKey: "2026-09-01", weightKg: 80.4, weightEwma: 80.3, bodyFatPct: null, leanMassKg: null, waistCm: null },
      { dateKey: "2026-09-07", weightKg: 80, weightEwma: 80, bodyFatPct: null, leanMassKg: null, waistCm: null },
      { dateKey: "2026-09-08", weightKg: 79.4, weightEwma: 79.94, bodyFatPct: 18, leanMassKg: 65, waistCm: 88 },
      { dateKey: "2026-09-09", weightKg: 79.8, weightEwma: 79.93, bodyFatPct: null, leanMassKg: null, waistCm: null },
    ],
    summary: { weightDelta7d: -0.3, weightDelta30d: -1.2, bfDelta30d: -0.5, waistDelta30d: -1, ewmaLatest: 79.93 },
  };

  test("trendPoints maps raw + ewma for the chart", () => {
    expect(trendPoints(trends)).toEqual([
      { dateKey: "2026-08-08", raw: 81.2, ewma: 81.2 },
      { dateKey: "2026-09-01", raw: 80.4, ewma: 80.3 },
      { dateKey: "2026-09-07", raw: 80, ewma: 80 },
      { dateKey: "2026-09-08", raw: 79.4, ewma: 79.94 },
      { dateKey: "2026-09-09", raw: 79.8, ewma: 79.93 },
    ]);
  });

  test("optimisticTrends appends a new day continuing the EWMA and updates the summary", () => {
    const next = optimisticTrends(trends, "2026-09-10", 79.0);
    expect(next.points).toHaveLength(6);
    const last = next.points[5];
    expect(last.dateKey).toBe("2026-09-10");
    expect(last.weightKg).toBe(79);
    const ewma = 79.93 + 0.1 * (79 - 79.93);
    expect(last.weightEwma).toBeCloseTo(ewma, 2);
    expect(next.summary.ewmaLatest).toBe(last.weightEwma);
    expect(next.summary.weightDelta7d).toBeCloseTo(ewma - 80.3, 1); // vs the trend on 09-03 → carries 09-01
    expect(next.summary.weightDelta30d).toBeCloseTo(ewma - 81.2, 1);
    // original untouched
    expect(trends.points).toHaveLength(5);
  });

  test("optimisticTrends replaces a same-day point instead of duplicating it", () => {
    const next = optimisticTrends(trends, "2026-09-09", 79.2);
    expect(next.points).toHaveLength(5);
    expect(next.points[4].weightKg).toBe(79.2);
    expect(next.points[4].bodyFatPct).toBeNull();
  });

  test("optimisticSummary swaps the latest weigh-in and the trend weight", () => {
    const summary = { latest: null, prev: null, latestWeighIn: null, ewmaWeightKg: 79.9, deltas: { weightKg: null, bodyFatPct: null, leanMassKg: null, waistCm: null }, category: null, profile: { gender: "male", heightCm: 180 } } as BodySummary;
    const next = optimisticSummary(summary, { id: "tmp", dateKey: "2026-09-10", weightKg: 79, source: "manual", createdAt: "2026-09-10T06:00:00.000Z" });
    expect(next.latestWeighIn?.weightKg).toBe(79);
    expect(next.ewmaWeightKg).toBeCloseTo(79.9 + 0.1 * (79 - 79.9), 2);
    expect(weighInDefault(next)).toBe(79);
    expect(weighInDefault(summary)).toBe(79.9);
    expect(weighInDefault({ ...summary, ewmaWeightKg: null })).toBe(75);
  });

  test("ranges are 30/90/180/365 days", () => {
    expect(RANGES.map((r) => r.days)).toEqual([30, 90, 180, 365]);
  });
});
