import { fmtKg, fmtPct, fmtKcal, fmtDate, fmtNumber, fmtDelta, fmtGrams, fmtDuration, fmtInt, fmtCm } from "../../src/lib/format";

describe("format (tr-TR)", () => {
  test("fmtKg rounds to one decimal with a Turkish comma", () => {
    expect(fmtKg(72.456)).toBe("72,5 kg");
    expect(fmtKg(80)).toBe("80,0 kg");
    expect(fmtKg(null)).toBe("—");
  });

  test("fmtPct puts the percent sign in front (Turkish style)", () => {
    expect(fmtPct(18.234)).toBe("%18,2");
    expect(fmtPct(50, 0)).toBe("%50");
    expect(fmtPct(undefined)).toBe("—");
  });

  test("fmtKcal groups thousands with a dot and has no decimals", () => {
    expect(fmtKcal(1850.4)).toBe("1.850 kcal");
    expect(fmtKcal(0)).toBe("0 kcal");
  });

  test("fmtInt / fmtNumber", () => {
    expect(fmtInt(12345)).toBe("12.345");
    expect(fmtNumber(3.14159, 2)).toBe("3,14");
  });

  test("fmtGrams / fmtCm", () => {
    expect(fmtGrams(150)).toBe("150 g");
    expect(fmtCm(84.25)).toBe("84,3 cm");
  });

  test("fmtDelta uses a real minus sign and a plus for gains", () => {
    expect(fmtDelta(-0.4, "kg")).toBe("−0,4 kg");
    expect(fmtDelta(1.25, "kg")).toBe("+1,3 kg");
    expect(fmtDelta(0, "kg")).toBe("0,0 kg");
    expect(fmtDelta(null, "kg")).toBe("—");
  });

  test("fmtDate renders Turkish month names in Türkiye time", () => {
    expect(fmtDate("2026-09-10")).toBe("10 Eylül");
    expect(fmtDate("2026-09-10", "long")).toBe("10 Eylül 2026");
    expect(fmtDate("2026-09-10", "weekday")).toBe("Perşembe, 10 Eylül");
    expect(fmtDate("2026-09-10", "short")).toBe("10 Eyl");
    // An instant just after midnight UTC is still the previous TR day? No — TR is UTC+3, so 22:00Z is next day in TR.
    expect(fmtDate(new Date("2026-09-09T22:30:00Z"))).toBe("10 Eylül");
  });

  test("fmtDuration formats minutes as hours + minutes", () => {
    expect(fmtDuration(65)).toBe("1 sa 5 dk");
    expect(fmtDuration(45)).toBe("45 dk");
    expect(fmtDuration(120)).toBe("2 sa");
  });
});
