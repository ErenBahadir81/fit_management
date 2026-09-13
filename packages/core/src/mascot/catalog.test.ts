import { describe, expect, it } from "vitest";
import { zMood, type Mood } from "../schemas/common";
import { MASCOT_KEYS } from "../schemas/mascot";
import { DEFAULT_MASCOT_MESSAGES, MOOD_LABEL_TR, pickVariant, renderTemplate } from "./catalog";

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

  it("every mood Floo can wear has lines to say in it", () => {
    const used = new Set(DEFAULT_MASCOT_MESSAGES.map((m) => m.mood));
    for (const mood of zMood.options) expect(used.has(mood), `no line uses mood "${mood}"`).toBe(true);
  });

  it("knows the wider emotion set", () => {
    expect(zMood.options).toEqual(["happy", "cheer", "think", "sleepy", "flex", "worried", "proud", "sad", "hype", "curious"]);
    for (const mood of zMood.options) expect(MOOD_LABEL_TR[mood as Mood]).toBeTruthy();
  });

  it("never shames and never piles on exclamation marks", () => {
    for (const t of DEFAULT_MASCOT_MESSAGES) {
      for (const v of t.variants) {
        expect(v, `${t.key}: ${v}`).not.toMatch(/!!/);
        expect((v.match(/!/g) ?? []).length, `${t.key}: ${v}`).toBeLessThanOrEqual(1);
        expect(v, `${t.key}: ${v}`).not.toMatch(/\b(tembel|beceriksiz|başarısız|utan|suçlu|rezil|berbatsın)\b/i);
      }
    }
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
