import { springs, durations, staggerDelay, resolveSpring, STAGGER_MS, STAGGER_CAP } from "../../src/theme/motion";

describe("motion tokens", () => {
  test("spring presets match the design spec", () => {
    expect(springs.snappy).toMatchObject({ damping: 18, stiffness: 260 });
    expect(springs.gentle).toMatchObject({ damping: 20, stiffness: 140 });
    expect(springs.bouncy).toMatchObject({ damping: 12, stiffness: 220 });
    expect(durations).toEqual({ fast: 120, base: 200, slow: 320 });
  });

  test("stagger delay is 30 ms per card and capped at 6 cards", () => {
    expect(STAGGER_MS).toBe(30);
    expect(STAGGER_CAP).toBe(6);
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(3)).toBe(90);
    expect(staggerDelay(10)).toBe(6 * 30);
  });

  test("resolveSpring falls back to a 150 ms fade under reduced motion", () => {
    expect(resolveSpring("snappy", false)).toEqual({ kind: "spring", config: springs.snappy });
    expect(resolveSpring("snappy", true)).toEqual({ kind: "timing", config: { duration: 150 } });
  });
});
