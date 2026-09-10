import { describe, expect, it } from "vitest";
import {
  advancePointer,
  catalogIndex,
  currentDay,
  isValidIndex,
  jumpTo,
  normalizeIndex,
  normalizeProgramInput,
  rewindPointer,
} from "./program";
import { EREN_DAYS, INCI_DAYS } from "./fixtures";

const program = (currentIndex: number, weekNumber = 1, days = EREN_DAYS) => ({ days, currentIndex, weekNumber });

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

describe("advancePointer", () => {
  it("moves to the next day of the cycle", () => {
    expect(advancePointer(program(0))).toEqual({ currentIndex: 1, weekNumber: 1, wrapped: false });
  });
  it("wraps at the end of the cycle and bumps the week", () => {
    expect(advancePointer(program(6, 3))).toEqual({ currentIndex: 0, weekNumber: 4, wrapped: true });
  });
  it("honours a shorter cycle (İnci: 4 days)", () => {
    expect(advancePointer(program(3, 1, INCI_DAYS))).toEqual({ currentIndex: 0, weekNumber: 2, wrapped: true });
  });
  it("repairs an out-of-range pointer first", () => {
    expect(advancePointer(program(99))).toEqual({ currentIndex: 2, weekNumber: 1, wrapped: false }); // 99 % 7 = 1
  });
  it("is a no-op for an empty program", () => {
    expect(advancePointer({ days: [], currentIndex: 0, weekNumber: 2 })).toEqual({ currentIndex: 0, weekNumber: 2, wrapped: false });
  });
});

describe("rewindPointer (undo)", () => {
  it("restores the stored pointer", () => {
    expect(rewindPointer(program(3, 2), 2)).toMatchObject({ currentIndex: 2, weekNumber: 2 });
  });
  it("rolls the week back when the undone session closed the cycle", () => {
    expect(rewindPointer(program(0, 4), 6)).toMatchObject({ currentIndex: 6, weekNumber: 3 });
  });
  it("never drops below week 1", () => {
    expect(rewindPointer(program(0, 1), 6)).toMatchObject({ currentIndex: 6, weekNumber: 1 });
  });
  it("keeps the pointer when nothing was stored", () => {
    expect(rewindPointer(program(3, 2), null)).toMatchObject({ currentIndex: 3, weekNumber: 2 });
  });
});

describe("jumpTo / isValidIndex / currentDay", () => {
  it("jumps without touching the week", () => {
    expect(jumpTo(program(0, 5), 4)).toEqual({ currentIndex: 4, weekNumber: 5, wrapped: false });
  });
  it("validates the requested index against the cycle length", () => {
    expect(isValidIndex(0, 7)).toBe(true);
    expect(isValidIndex(6, 7)).toBe(true);
    expect(isValidIndex(7, 7)).toBe(false);
    expect(isValidIndex(-1, 7)).toBe(false);
    expect(isValidIndex(1.5, 7)).toBe(false);
  });
  it("resolves the current day safely", () => {
    expect(currentDay(program(2))?.title).toBe("Bacak");
    expect(currentDay(program(99))?.title).toBe("Kondisyon"); // 99 % 7 = 1
    expect(currentDay({ days: [], currentIndex: 0 })).toBeNull();
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
    expect(days[0]).toMatchObject({ order: 1, title: "1. Gün", focus: "", kind: "strength", run: null, swim: null });
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
