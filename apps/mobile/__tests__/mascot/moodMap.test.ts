import { zMood } from "@fitfloow/core";
import { FLOO_MOODS } from "../../src/mascot/moods";
import { MOODS } from "../../src/mascot/model/params";
import { toFlooMood, toLegacyMood } from "../../src/mascot/moodMap";

describe("mood vocabularies", () => {
  test("every mood the API can send lands on a face the model can draw", () => {
    for (const m of zMood.options) expect(MOODS).toContain(toFlooMood(m));
  });

  test("names both vocabularies share keep their meaning", () => {
    for (const m of FLOO_MOODS) if ((MOODS as readonly string[]).includes(m)) expect(toFlooMood(m)).toBe(m);
    // model-only moods pass straight through
    expect(toFlooMood("idle")).toBe("idle");
    expect(toFlooMood("celebrate")).toBe("celebrate");
    expect(toFlooMood("energetic")).toBe("energetic");
  });

  test("the four API-only moods take the nearest model pose, not a neutral one", () => {
    expect(toFlooMood("cheer")).toBe("celebrate");
    expect(toFlooMood("hype")).toBe("celebrate");
    expect(toFlooMood("flex")).toBe("energetic");
    expect(toFlooMood("curious")).toBe("think");
  });

  test("the SVG fallback gets a v1 face for every model mood, and shared names round-trip", () => {
    for (const m of MOODS) expect(FLOO_MOODS).toContain(toLegacyMood(m));
    for (const m of FLOO_MOODS) expect(toFlooMood(toLegacyMood(toFlooMood(m)))).toBe(toFlooMood(m));
    expect(toLegacyMood("celebrate")).toBe("cheer");
    expect(toLegacyMood("energetic")).toBe("flex");
    expect(toLegacyMood("idle")).toBe("happy");
  });

  test("an unknown value from an older or newer server still draws a face", () => {
    expect(MOODS).toContain(toFlooMood("grumpy" as never));
    expect(FLOO_MOODS).toContain(toLegacyMood("grumpy" as never));
  });
});
