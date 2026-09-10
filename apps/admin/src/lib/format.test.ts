import { describe, expect, it } from "vitest";
import { date, dateShort, delta, duration, initials, int, kcal, kg, num, pct, plural, relative } from "./format";

describe("tr-TR formatting", () => {
  it("uses a comma decimal separator and a dot thousands separator", () => {
    expect(num(1234.5, 1)).toBe("1.234,5");
    expect(int(12480)).toBe("12.480");
    expect(num(0.5, 2)).toBe("0,50");
  });

  it("renders an em dash for missing or non-finite values", () => {
    expect(num(null)).toBe("—");
    expect(num(undefined)).toBe("—");
    expect(num(Number.NaN)).toBe("—");
    expect(kg(null)).toBe("—");
    expect(pct(null)).toBe("—");
    expect(kcal(null)).toBe("—");
  });

  it("formats domain units the way the product writes them", () => {
    expect(kcal(2456.4)).toBe("2.456 kcal");
    expect(kg(103.25)).toBe("103,3 kg");
    expect(pct(10.25)).toBe("%10,3");
    expect(duration(95)).toBe("1 sa 35 dk");
    expect(duration(42)).toBe("42 dk");
  });

  it("signs deltas with a real minus sign", () => {
    expect(delta(1.2)).toBe("+1,2");
    expect(delta(-0.45, 2, "kg")).toBe("−0,45 kg");
    expect(delta(0)).toBe("0,0");
  });

  it("reads date keys as Türkiye local days, not UTC", () => {
    // 2026-01-01 at 00:00 TR is still 2025-12-31 in UTC; the key must win.
    expect(date("2026-01-01")).toBe("01 Oca 2026");
    expect(dateShort("2026-09-10")).toBe("10 Eyl");
  });

  it("describes recent instants in coarse Turkish", () => {
    const now = new Date("2026-09-10T12:00:00Z");
    expect(relative(new Date("2026-09-10T11:58:00Z"), now)).toBe("2 dk önce");
    expect(relative(new Date("2026-09-10T09:00:00Z"), now)).toBe("3 sa önce");
    expect(relative(new Date("2026-09-05T12:00:00Z"), now)).toBe("5 gün önce");
    expect(relative(new Date("2026-09-10T11:59:50Z"), now)).toBe("az önce");
    expect(relative(null)).toBe("—");
  });

  it("builds Turkish-uppercased initials", () => {
    expect(initials("Eren Yılmaz")).toBe("EY");
    expect(initials("inci")).toBe("İ");
  });

  it("pluralises with the count in front", () => {
    expect(plural(1, "kullanıcı")).toBe("1 kullanıcı");
    expect(plural(12, "kas")).toBe("12 kas");
  });
});
