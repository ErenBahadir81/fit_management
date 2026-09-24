import { dark, light, type ThemeColors } from "../../src/theme/tokens";

/** WCAG 2.x contrast, with alpha colours composited over what they sit on. */
function rgba(c: string): [number, number, number, number] {
  if (c.startsWith("#")) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
  const [r, g, b, a] = c.replace(/rgba\(|\)/g, "").split(",").map(Number);
  return [r, g, b, a];
}
function over(fg: string, bg: string): string {
  const f = rgba(fg);
  const b = rgba(bg);
  const mix = (i: number) => Math.round(f[3] * f[i] + (1 - f[3]) * b[i]);
  return `#${[0, 1, 2].map((i) => mix(i).toString(16).padStart(2, "0")).join("")}`;
}
function luminance(c: string): number {
  const [r, g, b] = rgba(c).map((v, i) => (i < 3 ? v / 255 : v));
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

type Key = keyof ThemeColors;
const TEXT: [Key, Key][] = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink", "surfaceMuted"],
  ["inkMuted", "bg"],
  ["inkMuted", "surface"],
  ["inkMuted", "surfaceMuted"],
  ["inkSubtle", "bg"],
  ["inkSubtle", "surface"],
  ["inkSubtle", "surfaceMuted"],
  ["primary", "bg"],
  ["primary", "surface"],
  ["primary", "primarySoft"],
  ["onPrimary", "primary"],
  ["success", "surface"],
  ["success", "successSoft"],
  ["warning", "surface"],
  ["warning", "warningSoft"],
  ["danger", "surface"],
  ["danger", "dangerSoft"],
  ["ink", "flooBubble"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s palette contrast", (_name, c) => {
  test.each(TEXT)("%s text on %s is AA (≥ 4.5:1)", (fg, bg) => {
    expect(contrast(c[fg] as string, c[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });

  test("secondary text on a primary card (onPrimaryMuted) is AA", () => {
    expect(contrast(over(c.onPrimaryMuted, c.primary), c.primary)).toBeGreaterThanOrEqual(4.5);
  });

  test("onScrim is AA on the scrim, whatever photo or camera frame is under it", () => {
    for (const photo of ["#FFFFFF", "#808080", "#000000"]) {
      expect(contrast(c.onScrim, over(c.overlay, photo))).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("input edges (controlBorder) reach 3:1 on every plane an input sits on", () => {
    for (const plane of [c.bg, c.surface, c.surfaceElevated]) {
      expect(contrast(c.controlBorder, plane)).toBeGreaterThanOrEqual(3);
    }
  });
});
