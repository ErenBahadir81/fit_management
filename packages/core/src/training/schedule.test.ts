import { describe, expect, it } from "vitest";
import { buildSchedule, logsByDateKey } from "./schedule";
import { EREN_DAYS, INCI_DAYS } from "./fixtures";

const TODAY = "2026-09-10"; // Thursday (weekday 4)
const program = (currentIndex: number, days = EREN_DAYS) => ({ days, currentIndex, weekNumber: 1 });
const log = (dateKey: string, dayOrder: number, extra: Record<string, unknown> = {}) => ({
  id: `log-${dateKey}`,
  date: `${dateKey}T09:00:00.000Z`,
  dateKey,
  dayOrder,
  isOffDay: false,
  strength: [],
  ...extra,
});

describe("buildSchedule", () => {
  it("returns today + the next 6 days with weekdays", () => {
    const s = buildSchedule(program(0), [], TODAY);
    expect(s).toHaveLength(7);
    expect(s.map((e) => e.dateKey)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
    ]);
    expect(s.map((e) => e.weekday)).toEqual([4, 5, 6, 0, 1, 2, 3]);
    expect(s[0].isToday).toBe(true);
    expect(s.slice(1).every((e) => !e.isToday)).toBe(true);
  });

  it("maps the cycle forward from the pointer and wraps", () => {
    const s = buildSchedule(program(5), [], TODAY);
    expect(s.map((e) => e.day?.order)).toEqual([6, 7, 1, 2, 3, 4, 5]);
    expect(s[0].status).toBe("today");
    expect(s.slice(1).map((e) => e.status)).toEqual(Array(6).fill("upcoming"));
  });

  it("wraps a 4-day cycle twice inside one strip", () => {
    const s = buildSchedule(program(2, INCI_DAYS), [], TODAY);
    expect(s.map((e) => e.day?.order)).toEqual([3, 4, 1, 2, 3, 4, 1]);
  });

  it("marks today done and starts the forward mapping tomorrow (pointer already advanced)", () => {
    const s = buildSchedule(program(1), [log(TODAY, 1)], TODAY);
    expect(s[0]).toMatchObject({ status: "done", logId: `log-${TODAY}`, isToday: true });
    expect(s[0].day?.order).toBe(1); // what was actually done
    expect(s.map((e) => e.day?.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("marks an off-day log as skipped and leaves the pointer where it is", () => {
    const s = buildSchedule(program(1), [log(TODAY, 2, { isOffDay: true, title: "Dinlenme" })], TODAY);
    expect(s[0].status).toBe("skipped");
    expect(s.map((e) => e.day?.order)).toEqual([2, 2, 3, 4, 5, 6, 7]);
  });

  it("includes past days of the week from logs when asked", () => {
    const s = buildSchedule(program(2), [log("2026-09-08", 1), log("2026-09-09", 2, { isOffDay: true })], TODAY, {
      count: 7,
      daysBefore: 3,
    });
    expect(s.map((e) => e.dateKey)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
    expect(s.map((e) => e.status)).toEqual(["past", "done", "skipped", "today", "upcoming", "upcoming", "upcoming"]);
    expect(s[0].day).toBeNull(); // an untracked past day has no cycle day
    expect(s[1].day?.order).toBe(1);
    expect(s[3].day?.order).toBe(3);
  });

  it("falls back to the projected day when the log's dayOrder is unknown", () => {
    const s = buildSchedule(program(3), [log(TODAY, 99)], TODAY);
    expect(s[0].day?.order).toBe(3); // pointer 3 → day 4 was completed → today shows day 3+1-1
    expect(s[0].status).toBe("done");
  });

  it("survives an empty program", () => {
    const s = buildSchedule({ days: [], currentIndex: 0, weekNumber: 1 }, [], TODAY);
    expect(s).toHaveLength(7);
    expect(s.every((e) => e.day === null)).toBe(true);
    expect(s[0].status).toBe("today");
  });

  it("prefers a real session over an off-day marker on the same day", () => {
    const map = logsByDateKey([log(TODAY, 1, { isOffDay: true, id: "off" }), log(TODAY, 1, { id: "real" })]);
    expect(map.get(TODAY)?.id).toBe("real");
  });

  it("derives the day key from `date` when `dateKey` is missing", () => {
    const map = logsByDateKey([{ date: "2026-09-10T20:30:00.000Z", dayOrder: 1 }]);
    expect([...map.keys()]).toEqual(["2026-09-10"]);
  });
});
