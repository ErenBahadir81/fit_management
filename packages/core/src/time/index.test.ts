import { describe, expect, it } from "vitest";
import {
  ageFromBirthDate,
  dayIndexInWeek,
  daysBetween,
  isDateKey,
  keyBounds,
  keyRange,
  keyToStart,
  keyWeekday,
  previousWeekKeys,
  shiftKey,
  trDateKey,
  trDayBounds,
  trWeekday,
  weekKeyFor,
  weekRange,
} from "./index";

describe("time — Türkiye local day", () => {
  it("dateKey follows TR wall clock across the UTC midnight boundary", () => {
    // 2026-09-10T22:30Z is 2026-09-11 01:30 in Istanbul
    expect(trDateKey(new Date("2026-09-10T22:30:00Z"))).toBe("2026-09-11");
    expect(trDateKey(new Date("2026-09-10T20:59:59Z"))).toBe("2026-09-10");
  });
  it("weekday uses TR day (2026-09-10 is a Thursday)", () => {
    expect(trWeekday(new Date("2026-09-10T12:00:00Z"))).toBe(4);
    expect(trWeekday(new Date("2026-09-10T21:30:00Z"))).toBe(5); // Friday in TR
    expect(keyWeekday("2026-09-13")).toBe(0); // Sunday
  });
  it("day bounds are 21:00Z → 21:00Z next day", () => {
    const b = trDayBounds(new Date("2026-09-10T12:00:00Z"));
    expect(b.start.toISOString()).toBe("2026-09-09T21:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-09-10T21:00:00.000Z");
    expect(keyToStart("2026-09-10").toISOString()).toBe("2026-09-09T21:00:00.000Z");
    expect(keyBounds("2026-09-10").end.toISOString()).toBe("2026-09-10T21:00:00.000Z");
  });
  it("validates date keys", () => {
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2024-02-29")).toBe(true);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("nope")).toBe(false);
    expect(isDateKey(20260101)).toBe(false);
  });
  it("shifts and diffs keys across month/year boundaries", () => {
    expect(shiftKey("2026-12-30", 3)).toBe("2027-01-02");
    expect(shiftKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
    expect(daysBetween("2026-09-10", "2026-09-01")).toBe(-9);
    expect(keyRange("2026-09-28", "2026-10-02")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(keyRange("2026-09-02", "2026-09-01")).toEqual([]);
  });
});

describe("time — weeks", () => {
  it("Sunday-start week key for a Thursday is the previous Sunday", () => {
    expect(weekKeyFor("2026-09-10", 0)).toBe("2026-09-06");
  });
  it("Monday-start week key", () => {
    expect(weekKeyFor("2026-09-10", 1)).toBe("2026-09-07");
  });
  it("the start day maps to itself", () => {
    expect(weekKeyFor("2026-09-06", 0)).toBe("2026-09-06");
    expect(weekKeyFor("2026-09-12", 6)).toBe("2026-09-12");
  });
  it("wraps years", () => {
    expect(weekKeyFor("2027-01-01", 0)).toBe("2026-12-27");
  });
  it("weekRange returns 7 keys ending 6 days later", () => {
    const r = weekRange("2026-09-06");
    expect(r.endKey).toBe("2026-09-12");
    expect(r.keys).toHaveLength(7);
    expect(r.keys[6]).toBe("2026-09-12");
  });
  it("dayIndexInWeek", () => {
    expect(dayIndexInWeek("2026-09-10", "2026-09-06")).toBe(4);
    expect(dayIndexInWeek("2026-09-13", "2026-09-06")).toBeNull();
    expect(dayIndexInWeek("2026-09-05", "2026-09-06")).toBeNull();
  });
  it("previousWeekKeys", () => {
    expect(previousWeekKeys("2026-09-06", 2)).toEqual(["2026-08-30", "2026-08-23"]);
    expect(previousWeekKeys("2026-09-06", 2, true)).toEqual(["2026-09-06", "2026-08-30"]);
  });
  it("age from birth date", () => {
    expect(ageFromBirthDate("1990-09-11", "2026-09-10")).toBe(35);
    expect(ageFromBirthDate("1990-09-10", "2026-09-10")).toBe(36);
  });
});
