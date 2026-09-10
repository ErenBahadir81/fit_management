import { niceDomain, ticks, nearestIndex, ewmaSeries, buildTrendSeries, barLayout, dateTickLabels } from "../../src/charts/chartMath";

describe("chartMath", () => {
  test("niceDomain pads the min/max and never collapses", () => {
    expect(niceDomain([80, 82, 79.5], 0.1)).toEqual([79.25, 82.25]);
    expect(niceDomain([80], 0.1)).toEqual([79, 81]);
    expect(niceDomain([], 0.1)).toEqual([0, 1]);
  });

  test("ticks produce evenly spaced round values", () => {
    expect(ticks(79, 83, 5)).toEqual([79, 80, 81, 82, 83]);
    expect(ticks(0, 2000, 4)).toEqual([0, 500, 1000, 1500, 2000]);
  });

  test("nearestIndex snaps a scrub position to the closest point", () => {
    expect(nearestIndex([0, 10, 20, 30], 14)).toBe(1);
    expect(nearestIndex([0, 10, 20, 30], 16)).toBe(2);
    expect(nearestIndex([], 5)).toBe(-1);
  });

  test("ewmaSeries smooths with the core EWMA and skips nulls", () => {
    const out = ewmaSeries([80, null, 82, 81], 0.5);
    expect(out[0]).toBe(80);
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(81);
    expect(out[3]).toBe(81);
  });

  test("buildTrendSeries maps points to x-index, raw, ewma, goal", () => {
    const s = buildTrendSeries(
      [
        { dateKey: "2026-09-01", raw: 80, ewma: 80 },
        { dateKey: "2026-09-02", raw: null, ewma: 79.9 },
        { dateKey: "2026-09-03", raw: 79.5, ewma: 79.8 },
      ],
      78
    );
    expect(s.data).toHaveLength(3);
    expect(s.data[1]).toMatchObject({ x: 1, raw: null, ewma: 79.9, goal: 78 });
    expect(s.domainY[0]).toBeLessThan(78);
    expect(s.domainY[1]).toBeGreaterThan(80);
    expect(s.labels).toEqual(["1 Eyl", "2 Eyl", "3 Eyl"]);
  });

  test("barLayout distributes 7 bars with gaps inside the width", () => {
    const l = barLayout(7, 280, 8);
    expect(l.barWidth).toBe(32);
    expect(l.x(0)).toBe(0);
    expect(l.x(6)).toBe(6 * 40);
  });

  test("dateTickLabels thins labels to at most N", () => {
    const keys = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
    const labels = dateTickLabels(keys, 5);
    expect(labels.filter(Boolean).length).toBeLessThanOrEqual(6);
    expect(labels[0]).toBe("1 Eyl");
    expect(labels[29]).toBe("30 Eyl");
  });
});
