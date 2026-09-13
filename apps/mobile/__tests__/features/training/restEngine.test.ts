import {
  MAX_PRESET_SECONDS,
  MIN_PRESET_SECONDS,
  REST_PRESETS,
  REST_STEP_SECONDS,
  clampPresetSeconds,
  formatRest,
  remainingRestSeconds,
  restEndsAt,
  restSnapshot,
  totalRestSeconds,
  type RestPlan,
} from "../../../src/features/training/workout/restEngine";

const T0 = 1_700_000_000_000;
const plan = (baseSeconds: number, adjustments: number[] = []): RestPlan => ({ startedAt: T0, baseSeconds, adjustments });

describe("totalRestSeconds", () => {
  test("is the base duration when nothing was adjusted", () => {
    expect(totalRestSeconds(plan(90))).toBe(90);
  });

  test("sums every live adjustment onto the base", () => {
    expect(totalRestSeconds(plan(90, [15, 15, -15]))).toBe(105);
  });

  test("clamps to zero when the adjustments outweigh the base", () => {
    expect(totalRestSeconds(plan(30, [-15, -15, -15]))).toBe(0);
  });
});

describe("restEndsAt", () => {
  test("is the start plus the adjusted total", () => {
    expect(restEndsAt(plan(60, [30]))).toBe(T0 + 90_000);
  });

  test("is the start itself once the total is clamped away", () => {
    expect(restEndsAt(plan(20, [-60]))).toBe(T0);
  });
});

describe("remainingRestSeconds", () => {
  test("is the full duration at the moment the rest starts", () => {
    expect(remainingRestSeconds(plan(90), T0)).toBe(90);
  });

  test("counts down in real time, fractions included", () => {
    expect(remainingRestSeconds(plan(90), T0 + 30_500)).toBe(59.5);
  });

  test("never goes below zero once the rest is over", () => {
    expect(remainingRestSeconds(plan(90), T0 + 200_000)).toBe(0);
  });

  test("an adjustment that pushes the end past now puts time back on the clock", () => {
    expect(remainingRestSeconds(plan(60, [30]), T0 + 50_000)).toBe(40);
  });

  test("an adjustment that drives the end below now finishes the rest", () => {
    expect(remainingRestSeconds(plan(90, [-60]), T0 + 45_000)).toBe(0);
  });

  test("an adjustment applied after the rest already ended re-arms it (pure math, the controller gates this)", () => {
    const ended = plan(60);
    expect(remainingRestSeconds(ended, T0 + 70_000)).toBe(0);
    expect(remainingRestSeconds(plan(60, [15]), T0 + 70_000)).toBe(5);
  });
});

describe("restSnapshot", () => {
  test("reports the live view of a running rest", () => {
    expect(restSnapshot(plan(120), T0 + 30_000)).toEqual({
      remaining: 90,
      total: 120,
      endsAt: T0 + 120_000,
      elapsed: 30,
      progress: 0.25,
      finished: false,
    });
  });

  test("is finished, empty and complete at the end", () => {
    const s = restSnapshot(plan(60), T0 + 60_000);
    expect(s.finished).toBe(true);
    expect(s.remaining).toBe(0);
    expect(s.progress).toBe(1);
  });

  test("progress never overshoots once the rest is long over", () => {
    expect(restSnapshot(plan(60), T0 + 600_000).progress).toBe(1);
  });

  test("a zero-length rest is finished rather than dividing by zero", () => {
    const s = restSnapshot(plan(30, [-30]), T0);
    expect(s).toMatchObject({ total: 0, remaining: 0, progress: 1, finished: true });
  });

  test("a clock that jumped backwards still reads as a full rest", () => {
    const s = restSnapshot(plan(60), T0 - 5_000);
    expect(s.remaining).toBe(60);
    expect(s.progress).toBe(0);
    expect(s.finished).toBe(false);
  });
});

describe("clampPresetSeconds", () => {
  test("keeps a sensible duration untouched", () => {
    expect(clampPresetSeconds(90)).toBe(90);
  });

  test("rounds to whole seconds", () => {
    expect(clampPresetSeconds(62.4)).toBe(62);
  });

  test("clamps to the floor and the ceiling", () => {
    expect(clampPresetSeconds(1)).toBe(MIN_PRESET_SECONDS);
    expect(clampPresetSeconds(99_999)).toBe(MAX_PRESET_SECONDS);
  });

  test("falls back to the floor for a non-number", () => {
    expect(clampPresetSeconds(Number.NaN)).toBe(MIN_PRESET_SECONDS);
  });
});

describe("formatRest", () => {
  test.each([
    [0, "0:00"],
    [7, "0:07"],
    [89, "1:29"],
    [600, "10:00"],
    [-4, "0:00"],
  ])("%p seconds reads as %p", (seconds, expected) => {
    expect(formatRest(seconds)).toBe(expected);
  });

  test("rounds a partial second up so the clock never shows 0:00 while running", () => {
    expect(formatRest(8.2)).toBe("0:09");
  });
});

describe("constants", () => {
  test("the preset row covers the durations lifters actually use, in order", () => {
    expect(REST_PRESETS).toEqual([30, 45, 60, 90, 120, 180]);
    expect([...REST_PRESETS].every((s) => clampPresetSeconds(s) === s)).toBe(true);
  });

  test("the live step is 15 seconds", () => {
    expect(REST_STEP_SECONDS).toBe(15);
  });
});
