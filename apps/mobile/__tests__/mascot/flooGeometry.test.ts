import { FLOO_MOODS, MOOD_POSE, type FlooMood } from "../../src/mascot/moods";
import { clampGaze, mouthPath, saccadeTarget, volumePreservingScale } from "../../src/mascot/flooGeometry";

describe("volumePreservingScale", () => {
  test("a squash of 0 is the identity", () => {
    expect(volumePreservingScale(0)).toEqual({ scaleX: 1, scaleY: 1 });
  });

  test("squashing (positive) widens and flattens, preserving area", () => {
    const { scaleX, scaleY } = volumePreservingScale(0.06);
    expect(scaleX).toBeGreaterThan(1);
    expect(scaleY).toBeLessThan(1);
    expect(scaleX * scaleY).toBeCloseTo(1, 5);
  });

  test("stretching (negative) narrows and lengthens, preserving area", () => {
    const { scaleX, scaleY } = volumePreservingScale(-0.06);
    expect(scaleX).toBeLessThan(1);
    expect(scaleY).toBeGreaterThan(1);
    expect(scaleX * scaleY).toBeCloseTo(1, 5);
  });

  test("an absurd squash is clamped rather than inverting the body", () => {
    const { scaleX, scaleY } = volumePreservingScale(10);
    expect(scaleY).toBeGreaterThan(0.5);
    expect(scaleX).toBeLessThan(2);
  });
});

describe("mouthPath", () => {
  test("returns a closed path", () => {
    expect(mouthPath({ halfWidth: 20, open: 8, curve: 10 })).toMatch(/Z$/);
  });

  test("a wider mouth reaches further from the centre", () => {
    const narrow = mouthPath({ halfWidth: 10, open: 6, curve: 6 });
    const wide = mouthPath({ halfWidth: 30, open: 6, curve: 6 });
    expect(narrow).not.toBe(wide);
    // The first coordinate pair is the left corner: -halfWidth.
    expect(narrow.startsWith("M-10")).toBe(true);
    expect(wide.startsWith("M-30")).toBe(true);
  });

  test("a frown (negative curve) is a different shape from a smile", () => {
    expect(mouthPath({ halfWidth: 18, open: 2, curve: -8 })).not.toBe(mouthPath({ halfWidth: 18, open: 2, curve: 8 }));
  });

  test("never collapses to zero height, so the fill stays visible", () => {
    const flat = mouthPath({ halfWidth: 18, open: 0, curve: 0 });
    expect(flat).toMatch(/Z$/);
    expect(flat).not.toContain("NaN");
  });
});

describe("clampGaze", () => {
  test("leaves a gaze inside the radius alone", () => {
    expect(clampGaze(2, 3, 10)).toEqual({ x: 2, y: 3 });
  });

  test("pulls a gaze outside the radius back onto the circle", () => {
    const g = clampGaze(30, 40, 10);
    expect(Math.hypot(g.x, g.y)).toBeCloseTo(10, 5);
  });

  test("a zero-length gaze is the centre, not NaN", () => {
    expect(clampGaze(0, 0, 10)).toEqual({ x: 0, y: 0 });
  });
});

describe("saccadeTarget", () => {
  test("always lands inside the given radius", () => {
    for (let i = 0; i < 200; i++) {
      const t = saccadeTarget(6);
      expect(Math.hypot(t.x, t.y)).toBeLessThanOrEqual(6 + 1e-9);
    }
  });
});

describe("MOOD_POSE", () => {
  test("every mood in the catalogue has a pose", () => {
    for (const mood of FLOO_MOODS) expect(MOOD_POSE[mood]).toBeDefined();
    expect(Object.keys(MOOD_POSE).sort()).toEqual([...FLOO_MOODS].sort());
  });

  test("covers the six core moods plus the four expressive ones", () => {
    const expected: FlooMood[] = ["happy", "cheer", "think", "sleepy", "flex", "worried", "proud", "sad", "hype", "curious"];
    for (const m of expected) expect(FLOO_MOODS).toContain(m);
  });

  test("every pose stays inside its documented range", () => {
    for (const mood of FLOO_MOODS) {
      const p = MOOD_POSE[mood];
      expect(p.eyeOpen).toBeGreaterThanOrEqual(0);
      expect(p.eyeOpen).toBeLessThanOrEqual(1);
      expect(p.cheeks).toBeGreaterThanOrEqual(0);
      expect(p.cheeks).toBeLessThanOrEqual(1);
      expect(Math.abs(p.tilt)).toBeLessThanOrEqual(20);
      expect(p.hop).toBeGreaterThanOrEqual(0);
      expect(Math.hypot(p.gazeX, p.gazeY)).toBeLessThanOrEqual(p.gazeRadius ?? 8);
    }
  });

  test("the moods read differently from one another", () => {
    expect(MOOD_POSE.sleepy.eyeOpen).toBeLessThan(MOOD_POSE.happy.eyeOpen);
    expect(MOOD_POSE.cheer.hop).toBeGreaterThan(MOOD_POSE.happy.hop);
    expect(MOOD_POSE.hype.hop).toBeGreaterThan(MOOD_POSE.happy.hop);
    expect(MOOD_POSE.sad.mouthCurve).toBeLessThan(0);
    expect(MOOD_POSE.worried.mouthCurve).toBeLessThan(0);
    expect(MOOD_POSE.proud.browY).toBeLessThan(MOOD_POSE.sad.browY);
    expect(MOOD_POSE.curious.tilt).not.toBe(0);
    expect(MOOD_POSE.flex.armR).not.toBe(MOOD_POSE.happy.armR);
  });

  test("only cheer and hype leave the ground", () => {
    const airborne = FLOO_MOODS.filter((m) => MOOD_POSE[m].hop > 4);
    expect(airborne.sort()).toEqual(["cheer", "hype"]);
  });
});

/**
 * `Floo` reads these two from `useAnimatedStyle` / `useAnimatedProps`, i.e. on Reanimated's UI
 * runtime. Without the `"worklet"` directive the babel plugin leaves them as *remote* functions:
 * the UI runtime cannot call one synchronously, the call yields `undefined`, and the NaN that
 * flows into the SVG geometry terminates the app with `CALayerInvalidGeometry` — a native crash,
 * not a JS error, so nothing in the app can catch or report it.
 *
 * `saccadeTarget` is the counter-example: it runs in a `setTimeout` on the JS side and uses
 * `Math.random()`, so it must stay off the UI runtime.
 */
describe("UI-runtime helpers are worklets", () => {
  const isWorklet = (fn: unknown) => typeof fn === "function" && "__workletHash" in fn;

  test("volumePreservingScale and mouthPath are compiled as worklets", () => {
    expect(isWorklet(volumePreservingScale)).toBe(true);
    expect(isWorklet(mouthPath)).toBe(true);
  });

  test("saccadeTarget stays a plain JS function", () => {
    expect(isWorklet(saccadeTarget)).toBe(false);
  });
});
