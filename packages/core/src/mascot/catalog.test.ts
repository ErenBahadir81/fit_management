import { describe, expect, it } from "vitest";
import { MASCOT_KEYS } from "../schemas/mascot";
import { DEFAULT_MASCOT_MESSAGES, pickVariant, renderTemplate } from "./catalog";

describe("mascot catalog", () => {
  it("covers every mascot key with ≥1 variant, short sentences, ≤1 emoji", () => {
    for (const key of MASCOT_KEYS) {
      const t = DEFAULT_MASCOT_MESSAGES.find((m) => m.key === key);
      expect(t, key).toBeDefined();
      expect(t!.variants.length).toBeGreaterThan(0);
      for (const v of t!.variants) {
        expect(v.length, `${key}: ${v}`).toBeLessThanOrEqual(120);
        const emoji = (v.match(/\p{Extended_Pictographic}/gu) ?? []).length;
        expect(emoji, `${key}: ${v}`).toBeLessThanOrEqual(1);
      }
    }
    const keys = new Set(DEFAULT_MASCOT_MESSAGES.map((m) => m.key));
    expect(keys.size).toBe(DEFAULT_MASCOT_MESSAGES.length);
  });
  it("picks a stable variant per seed", () => {
    const v = ["a", "b", "c"];
    expect(pickVariant(v, "u1:2026-09-10:home.morning")).toBe(pickVariant(v, "u1:2026-09-10:home.morning"));
    expect(pickVariant([], "x")).toBe("");
  });
  it("renders placeholders and drops unknown ones", () => {
    expect(renderTemplate("Merhaba {name}, {kcal} kcal {nope} kaldı.", { name: "Eren", kcal: 420 })).toBe("Merhaba Eren, 420 kcal kaldı.");
  });
});
