import { describe, expect, it } from "vitest";
import {
  buildHits,
  computeReadiness,
  computeRecovery,
  overallReadiness,
  recoveredFraction,
  recoveryStatusOf,
} from "./recovery";
import { muscle, TEST_MUSCLES } from "./fixtures";
import { HOUR_MS } from "./types";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR_MS);

const log = (h: number, entries: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => ({
  date: hoursAgo(h).toISOString(),
  isOffDay: false,
  strength: entries,
  ...extra,
});
const ex = (muscles: string[], sets: number, extra: Record<string, unknown> = {}) => ({
  name: "X",
  muscles: muscles.map((key) => ({ key, load: 1 })),
  sets: Array.from({ length: sets }, () => ({ reps: 10, rir: 2 })),
  ...extra,
});

describe("recoveredFraction (v1 curve: 0 → 70 % at half → 100 % at full)", () => {
  it("is 0 at or before the session", () => {
    expect(recoveredFraction(0, 24)).toBe(0);
    expect(recoveredFraction(-5, 24)).toBe(0);
  });
  it("hits 70 % at half time", () => {
    expect(recoveredFraction(12, 24)).toBeCloseTo(0.7, 10);
    expect(recoveredFraction(24, 48)).toBeCloseTo(0.7, 10);
  });
  it("is linear in each leg", () => {
    expect(recoveredFraction(6, 24)).toBeCloseTo(0.35, 10);
    expect(recoveredFraction(18, 24)).toBeCloseTo(0.85, 10);
  });
  it("is 1 at and after full recovery", () => {
    expect(recoveredFraction(24, 24)).toBeCloseTo(1, 10);
    expect(recoveredFraction(40, 24)).toBe(1);
  });
  it("guards a non-positive window", () => {
    expect(recoveredFraction(1, 0)).toBe(1);
  });
});

describe("recoveryStatusOf thresholds", () => {
  it("< 40 fatigued, < 85 recovering, else ready", () => {
    expect(recoveryStatusOf(0)).toBe("fatigued");
    expect(recoveryStatusOf(39.9)).toBe("fatigued");
    expect(recoveryStatusOf(40)).toBe("recovering");
    expect(recoveryStatusOf(84)).toBe("recovering");
    expect(recoveryStatusOf(85)).toBe("ready");
    expect(recoveryStatusOf(100)).toBe("ready");
  });
});

describe("buildHits", () => {
  it("uses the real number of logged sets and each exercise's own muscles", () => {
    const hits = buildHits([log(2, [ex(["chest", "frontDelt"], 4), ex(["lats"], 3)])]);
    expect(hits).toHaveLength(3);
    expect(hits.filter((h) => h.key === "chest")[0]).toMatchObject({ sets: 4, load: 1 });
    expect(hits.filter((h) => h.key === "lats")[0]).toMatchObject({ sets: 3 });
    expect(hits[0].at).toBe(hoursAgo(2).getTime());
  });

  it("skips off-days, skipped exercises, stretch metric and empty sets", () => {
    const hits = buildHits([
      log(1, [ex(["chest"], 5)], { isOffDay: true }),
      log(1, [ex(["chest"], 5, { skipped: true })]),
      log(1, [ex(["chest"], 5, { metric: "stretch" })]),
      log(1, [ex(["chest"], 0)]),
    ]);
    expect(hits).toEqual([]);
  });

  it("keeps `time` metric entries (they are real work)", () => {
    expect(buildHits([log(1, [ex(["abs"], 3, { metric: "time" })])])).toHaveLength(1);
  });

  it("carries the exercise→muscle load and accepts legacy string muscles", () => {
    const hits = buildHits([
      log(1, [{ name: "Row", muscles: [{ key: "lats", load: 0.5 }], sets: [{}, {}] }]),
      log(1, [{ name: "Old", muscles: ["chest"], sets: [{}] }]),
    ]);
    expect(hits[0]).toMatchObject({ key: "lats", sets: 2, load: 0.5 });
    expect(hits[1]).toMatchObject({ key: "chest", sets: 1, load: 1 });
  });

  it("ignores logs with an invalid date", () => {
    expect(buildHits([{ date: "not-a-date", strength: [ex(["chest"], 3)] }])).toEqual([]);
  });
});

describe("computeReadiness", () => {
  const chest = [muscle("chest")];

  it("is 0 (fatigued) right after a session and 100 (ready) after full recovery", () => {
    const fresh = computeReadiness(buildHits([log(0, [ex(["chest"], 5)])]), chest, NOW)[0];
    expect(fresh.readiness).toBe(0);
    expect(fresh.status).toBe("fatigued");

    const old = computeReadiness(buildHits([log(24, [ex(["chest"], 5)])]), chest, NOW)[0];
    expect(old.readiness).toBe(100);
    expect(old.status).toBe("ready");
  });

  it("is 70 % at half of the recovery window (the v1 curve read as readiness)", () => {
    const m = computeReadiness(buildHits([log(12, [ex(["chest"], 5)])]), chest, NOW)[0];
    expect(m.readiness).toBe(70);
    expect(m.status).toBe("recovering");
    expect(m.residualSets).toBe(1.5);
  });

  it("never reports a muscle that was never trained as fatigued", () => {
    const m = computeReadiness([], TEST_MUSCLES, NOW)[0];
    expect(m).toMatchObject({ readiness: 100, status: "ready", lastTrainedAt: null, hoursSince: null, residualSets: 0 });
  });

  it("weighs sets by load (a half-load session fatigues half as much)", () => {
    const heavy = buildHits([log(20, [ex(["chest"], 5)]), log(0, [ex(["chest"], 4)])]);
    const light = buildHits([log(20, [ex(["chest"], 5)]), log(0, [{ name: "Half", muscles: [{ key: "chest", load: 0.5 }], sets: [{}, {}, {}, {}] }])]);
    expect(computeReadiness(heavy, chest, NOW)[0].readiness).toBe(10);
    expect(computeReadiness(light, chest, NOW)[0].readiness).toBe(50);
  });

  it("uses the heaviest still-fatiguing session as the reference (recovered ones do not inflate it)", () => {
    // 20 sets 30 h ago (fully recovered for a 24 h muscle) + 4 sets 12 h ago
    const hits = buildHits([log(30, [ex(["chest"], 20)]), log(12, [ex(["chest"], 4)])]);
    const m = computeReadiness(hits, chest, NOW)[0];
    expect(m.readiness).toBe(70); // reference = 4, residual = 4 × 0.3 = 1.2
  });

  it("clamps the residual ratio so readiness never goes below 0", () => {
    const hits = buildHits([log(1, [ex(["chest"], 4)]), log(0, [ex(["chest"], 4)])]);
    expect(computeReadiness(hits, chest, NOW)[0].readiness).toBe(0);
  });

  it("respects each muscle's own fullRecoveryHours (small = 48 h)", () => {
    const hits = buildHits([log(24, [ex(["sideDelt"], 3)])]);
    const m = computeReadiness(hits, [muscle("sideDelt")], NOW)[0];
    expect(m.fullRecoveryHours).toBe(48);
    expect(m.readiness).toBe(70);
    expect(m.hoursToFull).toBe(24);
    expect(m.hoursSince).toBe(24);
  });

  it("counts load-weighted weekly sets over the last 7 days only", () => {
    const hits = buildHits([
      log(8 * 24, [ex(["chest"], 5)]), // 8 days ago → outside the week
      log(3 * 24, [ex(["chest"], 4)]),
      log(1, [{ name: "Half", muscles: [{ key: "chest", load: 0.5 }], sets: [{}, {}] }]),
    ]);
    expect(computeReadiness(hits, chest, NOW)[0].weeklySets).toBe(5); // 4 + 2×0.5
  });

  it("ignores hits in the future and unknown muscle keys", () => {
    const hits = [
      { key: "chest", sets: 5, load: 1, at: NOW.getTime() + HOUR_MS },
      { key: "ghost", sets: 9, load: 1, at: NOW.getTime() },
    ];
    const out = computeReadiness(hits, chest, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "chest", readiness: 100 });
  });

  it("returns the muscles in the order given, with presentation fields from the muscle config", () => {
    const out = computeReadiness([], TEST_MUSCLES, NOW);
    expect(out.map((m) => m.key)).toEqual(TEST_MUSCLES.map((m) => m.key));
    expect(out[0]).toMatchObject({ name: "Göğüs", short: "Göğüs", color: "#EF6C6C", size: "large", weeklyTarget: { min: 15, max: 20 } });
  });

  it("reports lastTrainedAt as an ISO instant of the most recent hit", () => {
    const hits = buildHits([log(30, [ex(["chest"], 3)]), log(5, [ex(["chest"], 3)])]);
    expect(computeReadiness(hits, chest, NOW)[0].lastTrainedAt).toBe(hoursAgo(5).toISOString());
  });
});

describe("overallReadiness / computeRecovery", () => {
  it("averages readiness and counts ready/fatigued muscles", () => {
    const view = computeRecovery([log(0, [ex(["chest", "legs"], 5)])], TEST_MUSCLES, NOW);
    expect(view.muscles).toHaveLength(7);
    const chest = view.muscles.find((m) => m.key === "chest")!;
    expect(chest.readiness).toBe(0);
    expect(view.overall.readyCount).toBe(5);
    expect(view.overall.fatiguedCount).toBe(2);
    expect(view.overall.readiness).toBe(71); // (0 + 0 + 100×5) / 7
    expect(view.overall.status).toBe("recovering");
    expect(view.generatedAt).toBe(NOW.toISOString());
  });

  it("is fully ready with no logs at all", () => {
    const view = computeRecovery([], TEST_MUSCLES, NOW);
    expect(view.overall).toMatchObject({ readiness: 100, status: "ready", readyCount: 7, fatiguedCount: 0 });
  });

  it("handles an empty muscle list", () => {
    expect(overallReadiness([])).toMatchObject({ readiness: 100, status: "ready", readyCount: 0, fatiguedCount: 0 });
  });
});
