import { greetingFor, trHour, relativeDayLabel, todayKey, weekdayName, weekdayShort } from "../../src/lib/dates";

describe("dates", () => {
  test("trHour converts an instant to the Türkiye local hour", () => {
    expect(trHour(new Date("2026-09-10T05:30:00Z"))).toBe(8);
    expect(trHour(new Date("2026-09-10T22:00:00Z"))).toBe(1);
  });

  test("greetingFor picks a warm Turkish greeting by hour", () => {
    expect(greetingFor(7)).toBe("Günaydın");
    expect(greetingFor(13)).toBe("İyi günler");
    expect(greetingFor(19)).toBe("İyi akşamlar");
    expect(greetingFor(23)).toBe("İyi geceler");
    expect(greetingFor(3)).toBe("İyi geceler");
  });

  test("relativeDayLabel says Bugün / Dün / Yarın, else the date", () => {
    expect(relativeDayLabel("2026-09-10", "2026-09-10")).toBe("Bugün");
    expect(relativeDayLabel("2026-09-09", "2026-09-10")).toBe("Dün");
    expect(relativeDayLabel("2026-09-11", "2026-09-10")).toBe("Yarın");
    expect(relativeDayLabel("2026-09-01", "2026-09-10")).toBe("1 Eylül");
  });

  test("todayKey is a YYYY-MM-DD in TR time", () => {
    expect(todayKey(new Date("2026-09-09T22:30:00Z"))).toBe("2026-09-10");
  });

  test("weekday names", () => {
    expect(weekdayName(0)).toBe("Pazar");
    expect(weekdayShort(1)).toBe("Pzt");
  });
});
