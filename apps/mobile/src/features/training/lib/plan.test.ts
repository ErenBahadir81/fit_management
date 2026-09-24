import { shiftKey, weekdaySlot, type DayDTO, type ProgramDTO } from "@fitfloow/core";
import { makeLog, makeProgram, makeProgramView, PROGRAM_DAYS } from "../../../lib/fake/fixtures";
import { canResumePlanned, dayChoices, dayEyebrow, passLabel, upcomingDays, upcomingTitle } from "./plan";

// A Thursday: weekdaySlot = 3.
const TODAY = "2026-09-24";
const rest = (id: string): DayDTO => ({ id, order: 0, title: "Dinlenme", focus: "", kind: "rest", exercises: [], run: null, swim: null });

function weeklyProgram(): ProgramDTO {
  const days = [PROGRAM_DAYS[0], PROGRAM_DAYS[1], PROGRAM_DAYS[2], rest("r4"), PROGRAM_DAYS[4], rest("r6"), rest("r7")].map((d, i) => ({ ...d, order: i + 1 }));
  return { ...makeProgram(TODAY), mode: "weekly", days, cycleNumber: 4, weekNumber: 4 };
}

describe("program plan", () => {
  test("the pass label follows the mode", () => {
    expect(weekdaySlot(TODAY)).toBe(3);
    expect(passLabel(makeProgram(TODAY))).toBe("6. döngü");
    expect(passLabel(weeklyProgram())).toBe("4. hafta");
  });

  test("the eyebrow places today's day in the cycle, or in the week", () => {
    const cycle = makeProgram(TODAY);
    expect(dayEyebrow(cycle, cycle.days[1], TODAY)).toBe("6. döngü · 2/6. gün");
    expect(dayEyebrow(cycle, null, TODAY)).toBe("6. döngü");
    expect(dayEyebrow(weeklyProgram(), weeklyProgram().days[3], TODAY)).toBe("Perşembe · 4. hafta");
  });

  test("cycle mode shows the server's next-7-days projection as it is", () => {
    const program = makeProgram(TODAY);
    const view = makeProgramView(TODAY, program, [], 0);
    expect(upcomingDays(view, [], TODAY)).toBe(view.schedule);
    expect(upcomingTitle(program)).toBe("Önümüzdeki 7 gün");
    expect(view.schedule[0]).toMatchObject({ dateKey: TODAY, isToday: true });
    expect(view.schedule.map((s) => s.day?.id)).toEqual(["d1", "d2", "d3", "d4", "d5", "d6", "d1"]);
  });

  test("weekly mode shows the calendar week, Monday first, with what this week already holds", () => {
    const program = weeklyProgram();
    const monday = shiftKey(TODAY, -3);
    const tuesday = shiftKey(TODAY, -2);
    const history = [makeLog(program.days[0], monday, 4), makeLog(program.days[1], tuesday, 4, true), makeLog(program.days[0], shiftKey(TODAY, -9), 3)];
    const today = makeLog(program.days[3], TODAY, 4);
    const view = makeProgramView(TODAY, program, [today], 0);

    const week = upcomingDays(view, history, TODAY);
    expect(upcomingTitle(program)).toBe("Bu hafta");
    expect(week).toHaveLength(7);
    expect(week[0].dateKey).toBe(monday);
    expect(week.map((e) => e.status)).toEqual(["done", "skipped", "past", "done", "upcoming", "upcoming", "upcoming"]);
    expect(week.map((e) => e.day?.id)).toEqual(program.days.map((d) => d.id));
    expect(week[3].isToday).toBe(true);
  });

  test("the other-day picker lists every day and marks the planned one", () => {
    const program = makeProgram(TODAY);
    const choices = dayChoices(program, "d1");
    expect(choices.map((c) => c.position)).toEqual(["1. gün", "2. gün", "3. gün", "4. gün", "5. gün", "6. gün"]);
    expect(choices.filter((c) => c.planned).map((c) => c.day.id)).toEqual(["d1"]);
    expect(dayChoices(weeklyProgram(), null).map((c) => c.position)[6]).toBe("Pazar");
  });

  test("putting the missed day back in line only makes sense in a cycle, for another day, when a session was planned", () => {
    const program = makeProgram(TODAY);
    expect(canResumePlanned(program, "d1", "d3")).toBe(true);
    expect(canResumePlanned(program, "d1", "d1")).toBe(false);
    expect(canResumePlanned(program, "d4", "d1")).toBe(false); // planned rest day
    expect(canResumePlanned(program, null, "d1")).toBe(false);
    expect(canResumePlanned(weeklyProgram(), "d1", "d3")).toBe(false);
  });
});
