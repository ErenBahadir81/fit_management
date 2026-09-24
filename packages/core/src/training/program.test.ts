import { describe, expect, it } from "vitest";
import {
  catalogIndex,
  currentIndexFor,
  ensureDayIds,
  exerciseNameKey,
  freshDayId,
  isValidIndex,
  jumpTransition,
  logDayTransition,
  normalizeIndex,
  normalizeProgramInput,
  pointerOf,
  projectDays,
  reconcilePointer,
  undoTransition,
  weekdaySlot,
  weeklyCycleNumber,
} from "./program";
import { EREN_DAYS, INCI_DAYS } from "./fixtures";

/** İdman · Koşu · Mola — Eren's example of a calendar-free 3-day cycle. */
const TRIO = [
  { id: "idman", order: 1, kind: "strength" },
  { id: "kosu", order: 2, kind: "run" },
  { id: "mola", order: 3, kind: "rest" },
];
const cycle = (currentDayId: string, cycleNumber = 1, days = TRIO) => ({ mode: "cycle" as const, days, currentDayId, cycleNumber });
describe("normalizeIndex", () => {
  it("folds any integer into the cycle", () => {
    expect(normalizeIndex(0, 7)).toBe(0);
    expect(normalizeIndex(7, 7)).toBe(0);
    expect(normalizeIndex(9, 7)).toBe(2);
    expect(normalizeIndex(-1, 7)).toBe(6);
    expect(normalizeIndex(3, 0)).toBe(0);
    expect(normalizeIndex(Number.NaN, 7)).toBe(0);
  });
});

describe("logDayTransition — next = the day after the one actually done", () => {
  it("doing the planned day moves to the next one", () => {
    const t = logDayTransition(cycle("idman"), "idman")!;
    expect(t.before).toMatchObject({ currentDayId: "idman", cycleNumber: 1 });
    expect(t.after).toEqual({ currentDayId: "kosu", currentIndex: 1, cycleNumber: 1, wrapped: false });
  });

  it("a rest day is a day done: it advances like any other (B1)", () => {
    const t = logDayTransition(cycle("mola"), "mola")!;
    expect(t.after).toEqual({ currentDayId: "idman", currentIndex: 0, cycleNumber: 2, wrapped: true });
  });

  it("Eren's case: idman was due, a run was done instead → the cycle continues from the run", () => {
    const t = logDayTransition(cycle("idman", 3), "kosu")!;
    expect(t.dayIndex).toBe(1);
    expect(t.after).toMatchObject({ currentDayId: "mola", cycleNumber: 3, wrapped: false });
  });

  it("resumePlanned keeps the displaced day next ('İdmanı kaçırdım, sıraya geri koy')", () => {
    const t = logDayTransition(cycle("idman"), "kosu", { resumePlanned: true })!;
    expect(t.after).toMatchObject({ currentDayId: "idman", currentIndex: 0, wrapped: false });
  });

  it("resumePlanned is a no-op when the planned day itself was done", () => {
    expect(logDayTransition(cycle("idman"), "idman", { resumePlanned: true })!.after.currentDayId).toBe("kosu");
  });

  it("doing the last day out of turn still completes a pass", () => {
    expect(logDayTransition(cycle("idman", 4), "mola")!.after).toMatchObject({ currentDayId: "idman", cycleNumber: 5, wrapped: true });
  });

  it("works for any cycle length", () => {
    const days = ensureDayIds(INCI_DAYS);
    const last = days[days.length - 1].id;
    expect(logDayTransition({ days, currentDayId: last }, last)!.after).toMatchObject({ currentIndex: 0, cycleNumber: 2 });
  });

  it("unknown day → null (the caller answers 400)", () => {
    expect(logDayTransition(cycle("idman"), "nope")).toBeNull();
  });

  it("weekly programs never count cycle passes from the pointer", () => {
    const days = ensureDayIds(EREN_DAYS);
    const t = logDayTransition({ mode: "weekly", days, currentDayId: days[6].id, cycleNumber: 2 }, days[6].id)!;
    expect(t.after).toMatchObject({ currentIndex: 0, cycleNumber: 2, wrapped: false });
  });
});

describe("pointerOf — id first, legacy index as fallback", () => {
  it("follows the id wherever the day sits", () => {
    expect(pointerOf({ days: [TRIO[2], TRIO[0], TRIO[1]], currentDayId: "kosu" }).currentIndex).toBe(2);
  });
  it("reads a pre-3.0 program by index (folded into range)", () => {
    const days = ensureDayIds(EREN_DAYS);
    expect(pointerOf({ days, currentIndex: 9, weekNumber: 4 })).toEqual({ currentDayId: days[2].id, currentIndex: 2, cycleNumber: 4, wrapped: false });
  });
  it("an unknown id falls back to the index", () => {
    expect(pointerOf({ days: TRIO, currentDayId: "gone", currentIndex: 1 }).currentDayId).toBe("kosu");
  });
  it("empty program", () => {
    expect(pointerOf({ days: [] })).toEqual({ currentDayId: null, currentIndex: 0, cycleNumber: 1, wrapped: false });
  });
});

describe("undoTransition — B4: taking a log back restores the exact pointer", () => {
  it("restores the day and the cycle count the log moved away from", () => {
    const t = logDayTransition(cycle("mola", 2), "mola")!;
    const after = { ...cycle(t.after.currentDayId!, t.after.cycleNumber) };
    const back = undoTransition(after, { isBreak: false, pointerBeforeId: "mola", pointerAfterId: "idman", cycleBefore: 2 });
    expect(back).toMatchObject({ currentDayId: "mola", cycleNumber: 2 });
  });

  it("does not rewind when a later action already moved the pointer", () => {
    const back = undoTransition(cycle("mola"), { isBreak: false, pointerBeforeId: "idman", pointerAfterId: "kosu", cycleBefore: 1 });
    expect(back.currentDayId).toBe("mola");
  });

  it("breaks never moved the pointer, so taking one back leaves it", () => {
    expect(undoTransition(cycle("kosu"), { isBreak: true, isOffDay: true }).currentDayId).toBe("kosu");
  });

  it("still works after the days were reordered (ids, not positions)", () => {
    const reordered = { mode: "cycle" as const, days: [TRIO[1], TRIO[2], TRIO[0]], currentDayId: "kosu", cycleNumber: 1 };
    expect(undoTransition(reordered, { isBreak: false, pointerBeforeId: "idman", pointerAfterId: "kosu", cycleBefore: 1 }).currentIndex).toBe(2);
  });

  it("legacy log (index only): rewinds iff the pointer sits right after it, rolling the week back on a wrap", () => {
    const days = ensureDayIds(EREN_DAYS);
    expect(undoTransition({ days, currentIndex: 3, weekNumber: 2 }, { isOffDay: false, pointerBefore: 2 })).toMatchObject({ currentIndex: 2, cycleNumber: 2 });
    expect(undoTransition({ days, currentIndex: 0, weekNumber: 4 }, { isOffDay: false, pointerBefore: 6 })).toMatchObject({ currentIndex: 6, cycleNumber: 3 });
    expect(undoTransition({ days, currentIndex: 5, weekNumber: 2 }, { isOffDay: false, pointerBefore: 2 })).toMatchObject({ currentIndex: 5 });
  });
});

describe("jumpTransition / reconcilePointer", () => {
  it("jumps by id without touching the cycle count", () => {
    expect(jumpTransition(cycle("idman", 5), "mola")).toEqual({ currentDayId: "mola", currentIndex: 2, cycleNumber: 5, wrapped: false });
    expect(jumpTransition(cycle("idman"), "nope")).toBeNull();
  });

  it("B5: reordering keeps the pointer on the same day", () => {
    const next = reconcilePointer(cycle("kosu"), [TRIO[2], TRIO[1], TRIO[0]]);
    expect(next).toMatchObject({ currentDayId: "kosu", currentIndex: 1 });
  });

  it("deleting the current day hands the pointer to the day now in its place", () => {
    expect(reconcilePointer(cycle("kosu"), [TRIO[0], TRIO[2]])).toMatchObject({ currentDayId: "mola", currentIndex: 1 });
    expect(reconcilePointer(cycle("mola"), [TRIO[0]])).toMatchObject({ currentDayId: "idman", currentIndex: 0 });
  });
});

describe("weekly mode", () => {
  const days = ensureDayIds(EREN_DAYS);
  const weekly = { mode: "weekly" as const, days, currentDayId: days[0].id };

  it("maps dates to Monday-first slots", () => {
    expect(weekdaySlot("2026-09-21")).toBe(0); // Monday
    expect(weekdaySlot("2026-09-27")).toBe(6); // Sunday
  });

  it("today's day comes from the calendar; tomorrow's once today is logged", () => {
    expect(currentIndexFor(weekly, "2026-09-24", false)).toBe(3); // Thursday
    expect(currentIndexFor(weekly, "2026-09-24", true)).toBe(4);
    expect(currentIndexFor(weekly, "2026-09-27", true)).toBe(0); // Sunday → Monday
  });

  it("counts weeks from the start week's Monday", () => {
    expect(weeklyCycleNumber("2026-09-24", "2026-09-24")).toBe(1);
    expect(weeklyCycleNumber("2026-09-24", "2026-09-27")).toBe(1);
    expect(weeklyCycleNumber("2026-09-24", "2026-09-28")).toBe(2);
  });

  it("projects by weekday", () => {
    expect(projectDays(weekly, "2026-09-26", 3).map((p) => p.index)).toEqual([5, 6, 0]);
  });
});

describe("cycle projection", () => {
  it("walks forward from the pointer, wrapping", () => {
    expect(projectDays(cycle("mola"), "2026-09-24", 4).map((p) => p.day.id)).toEqual(["mola", "idman", "kosu", "mola"]);
    expect(currentIndexFor(cycle("kosu"), "2026-09-24", true)).toBe(1);
  });
});

describe("day ids", () => {
  it("legacy days get d<order>, existing ids are kept, duplicates re-issued", () => {
    expect(ensureDayIds([{ order: 1 }, { order: 2 }]).map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(ensureDayIds([{ id: "a", order: 1 }, { id: "a", order: 2 }, { order: 3 }]).map((d) => d.id)).toEqual(["a", "d2", "d3"]);
    expect(ensureDayIds([{ id: "d2", order: 1 }, { order: 2 }]).map((d) => d.id)).toEqual(["d2", "d3"]);
  });
  it("freshDayId never collides", () => {
    expect(freshDayId(["d1", "d7", "x"])).toBe("d8");
    expect(freshDayId([])).toBe("d1");
  });
  it("isValidIndex / normalizeIndex", () => {
    expect(isValidIndex(6, 7)).toBe(true);
    expect(isValidIndex(7, 7)).toBe(false);
    expect(isValidIndex(1.5, 7)).toBe(false);
  });
});

describe("exerciseNameKey (B8)", () => {
  it("folds every i variant and case, whatever the locale", () => {
    const k = exerciseNameKey("Incline Bench");
    expect(exerciseNameKey("İncline bench")).toBe(k);
    expect(exerciseNameKey("ıncline  BENCH ")).toBe(k);
    expect(exerciseNameKey("INCLINE BENCH")).toBe(k);
    expect(exerciseNameKey("Şınav")).toBe("şinav");
    expect(exerciseNameKey("ŞINAV")).toBe("şinav");
  });
});

describe("normalizeProgramInput", () => {
  const catalog = [
    { name: "Push-up", muscles: [{ key: "chest", load: 1 }, { key: "frontDelt", load: 0.5 }], metric: "reps", defaultSets: 5, defaultReps: 12 },
    { name: "Plank", muscles: [{ key: "abs", load: 1 }], metric: "time", defaultSets: 3, defaultReps: 45 },
    { name: "Eski Hareket", muscles: [{ key: "lats", load: 1 }], metric: "reps", active: false },
  ];

  it("fills muscles from the catalog by name, case-insensitively", () => {
    const { days, errors } = normalizeProgramInput(
      [{ order: 1, title: "Push", kind: "strength", exercises: [{ name: "push-UP", targetSets: 4, targetReps: 10 }] }],
      catalog
    );
    expect(errors).toEqual([]);
    expect(days[0].exercises[0]).toEqual({
      name: "push-UP",
      muscles: [{ key: "chest", load: 1 }, { key: "frontDelt", load: 0.5 }],
      targetSets: 4,
      targetReps: 10,
      targetRIR: null,
      metric: "reps",
    });
  });

  it("takes the metric from the catalog when omitted", () => {
    const { days } = normalizeProgramInput([{ order: 1, title: "Core", kind: "strength", exercises: [{ name: "Plank", targetSets: 3, targetReps: 45 }] }], catalog);
    expect(days[0].exercises[0].metric).toBe("time");
  });

  it("keeps explicitly given muscles and metric (ad-hoc exercise)", () => {
    const { days, errors } = normalizeProgramInput(
      [{ order: 1, title: "Ad-hoc", kind: "strength", exercises: [{ name: "Farmer Walk", muscles: [{ key: "traps", load: 0.8 }], metric: "time", targetSets: 2, targetReps: 60 }] }],
      catalog
    );
    expect(errors).toEqual([]);
    expect(days[0].exercises[0]).toMatchObject({ muscles: [{ key: "traps", load: 0.8 }], metric: "time" });
  });

  it("reports an exercise that is neither in the catalog nor carries muscles", () => {
    const { errors } = normalizeProgramInput([{ order: 1, title: "X", kind: "strength", exercises: [{ name: "Bilinmeyen", targetSets: 3, targetReps: 10 }] }], catalog);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Bilinmeyen");
  });

  it("does not resolve inactive catalog entries", () => {
    const { errors, days } = normalizeProgramInput([{ order: 1, title: "X", kind: "strength", exercises: [{ name: "Eski Hareket", targetSets: 3, targetReps: 10 }] }], catalog);
    expect(errors).toHaveLength(1);
    expect(days[0].exercises[0].muscles).toEqual([]);
  });

  it("requires day orders to be 1..N and renumbers them anyway", () => {
    const { days, errors } = normalizeProgramInput(
      [
        { order: 3, title: "A", kind: "strength", exercises: [] },
        { order: 9, title: "B", kind: "rest", exercises: [] },
      ],
      catalog
    );
    expect(errors).toEqual(["Gün sıraları 1..2 olmalı"]);
    expect(days.map((d) => d.order)).toEqual([1, 2]);
  });

  it("defaults titles, focus, kind and cardio targets", () => {
    const { days } = normalizeProgramInput([{ exercises: [] }], catalog);
    expect(days[0]).toMatchObject({ id: "d1", order: 1, title: "1. Gün", focus: "", kind: "strength", run: null, swim: null });
  });

  it("keeps ids of existing days (in any order) and issues fresh ones otherwise", () => {
    const { days } = normalizeProgramInput(
      [
        { id: "d3", order: 1, title: "C", kind: "rest", exercises: [] },
        { order: 2, title: "Yeni", kind: "rest", exercises: [] },
        { id: "hacker", order: 3, title: "X", kind: "rest", exercises: [] },
        { id: "d1", order: 4, title: "A", kind: "rest", exercises: [] },
      ],
      catalog,
      { existingIds: ["d1", "d2", "d3"] }
    );
    expect(days.map((d) => d.id)).toEqual(["d3", "d4", "d5", "d1"]);
  });

  it("weekly mode needs 7 days and names them by weekday", () => {
    expect(normalizeProgramInput([{ exercises: [] }], catalog, { mode: "weekly" }).errors).toContain("Haftalık programda tam 7 gün olmalı (Pazartesi → Pazar)");
    const { days, errors } = normalizeProgramInput(Array.from({ length: 7 }, (_, i) => ({ order: i + 1, kind: "rest", exercises: [] })), catalog, { mode: "weekly" });
    expect(errors).toEqual([]);
    expect(days.map((d) => d.title)).toEqual(["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]);
  });

  it("resolves catalog names across I/İ/ı (B8)", () => {
    const { errors } = normalizeProgramInput([{ order: 1, title: "X", kind: "strength", exercises: [{ name: "PUSH-UP", targetSets: 3, targetReps: 10 }] }], [
      { name: "push-up", muscles: [{ key: "chest", load: 1 }] },
    ]);
    expect(errors).toEqual([]);
  });

  it("clamps out-of-range numbers into the schema bounds", () => {
    const { days } = normalizeProgramInput(
      [{ order: 1, title: "X", kind: "strength", exercises: [{ name: "Push-up", targetSets: 99, targetReps: 9999, targetRIR: 42 }], run: { targetKm: 999, targetMin: 99999, label: "" } }],
      catalog
    );
    expect(days[0].exercises[0]).toMatchObject({ targetSets: 20, targetReps: 600, targetRIR: 10 });
    expect(days[0].run).toEqual({ targetKm: 200, targetMin: 1440, label: "" });
  });

  it("catalogIndex skips inactive and unnamed rows", () => {
    expect([...catalogIndex(catalog).keys()]).toEqual(["push-up", "plank"]);
  });
});
