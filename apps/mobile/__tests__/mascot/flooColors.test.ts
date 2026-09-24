import { FLOO_COLORS } from "../../src/mascot/moods";
import { dark, light } from "../../src/theme/tokens";

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe("the v1 SVG Floo's palette (web fallback)", () => {
  test("its body is the app's Floo blue, the same colour the theme and Floo 3 use", () => {
    expect(FLOO_COLORS.bodyMid).toBe(light.floo);
    expect(FLOO_COLORS.bodyMid).toBe(dark.floo);
  });

  test("no body-family colour is left violet", () => {
    const body = ["bodyLight", "bodyMid", "bodyDeep", "bounce", "rim", "mitten", "lidLight", "lidDeep", "shadow"] as const;
    for (const k of body) {
      const h = hue(FLOO_COLORS[k]);
      expect([k, h > 185 && h < 215]).toEqual([k, true]);
    }
  });
});
