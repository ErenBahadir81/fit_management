import type { DayDTO } from "@fitfloow/core";
import {
  activeSetIndex,
  createLoggerState,
  doneSets,
  elapsedMinutes,
  exerciseDone,
  loggerReducer,
  muscleSets,
  nextPending,
  progress,
  restRemaining,
  restoreDraft,
  toCompleteInput,
  totalSets,
  type LoggerState,
} from "./logger";

const STRENGTH_DAY: DayDTO = {
  order: 1,
  title: "Üst Vücut A",
  focus: "Göğüs · Sırt",
  kind: "strength",
  exercises: [
    { name: "Bench Press", muscles: [{ key: "chest", load: 1 }, { key: "triceps", load: 0.5 }], targetSets: 3, targetReps: 8, targetRIR: 2, metric: "reps" },
    { name: "Plank", muscles: [{ key: "core", load: 1 }], targetSets: 2, targetReps: 45, targetRIR: null, metric: "time" },
  ],
  run: null,
  swim: null,
};

const RUN_DAY: DayDTO = {
  order: 3,
  title: "Koşu",
  focus: "Tempo",
  kind: "run",
  exercises: [],
  run: { targetKm: 5, targetMin: 30, label: "Tempo" },
  swim: null,
};

const T0 = 1_757_000_000_000;

function make(day: DayDTO = STRENGTH_DAY): LoggerState {
  return createLoggerState({ day, dayIndex: 0, programId: "p_demo", weekNumber: 6, dateKey: "2026-09-10", startedAt: T0 });
}

describe("logger — creation", () => {
  test("seeds one pending set per target set with the planned reps/RIR", () => {
    const s = make();
    expect(s.exercises).toHaveLength(2);
    expect(s.exercises[0].sets).toHaveLength(3);
    expect(s.exercises[0].sets[0]).toEqual({ reps: 8, rir: 2, done: false });
    expect(s.exercises[1].sets[0]).toEqual({ reps: 45, rir: null, done: false }); // metric "time" → seconds
    expect(s.exercises[0].source).toBe("planned");
    expect(totalSets(s)).toBe(5);
    expect(doneSets(s)).toBe(0);
    expect(progress(s)).toBe(0);
    expect(s.restEndsAt).toBeNull();
  });

  test("a cardio day carries the segment list and no exercises", () => {
    const s = make(RUN_DAY);
    expect(s.exercises).toHaveLength(0);
    expect(s.run).toEqual(expect.objectContaining({ targetKm: 5, targetMin: 30 }));
    expect(s.run?.segments).toHaveLength(1);
    expect(s.run?.segments[0]).toEqual(expect.objectContaining({ km: 5, min: 30 }));
  });
});

describe("logger — completing sets", () => {
  test("completes the active set, starts the rest timer and moves focus to the next set", () => {
    let s = make();
    expect(activeSetIndex(s.exercises[0])).toBe(0);
    s = loggerReducer(s, { type: "complete-set", at: T0 + 60_000 });
    expect(s.exercises[0].sets[0].done).toBe(true);
    expect(doneSets(s)).toBe(1);
    expect(s.restEndsAt).toBe(T0 + 60_000 + s.restSeconds * 1000);
    expect(activeSetIndex(s.exercises[0])).toBe(1);
    expect(restRemaining(s, T0 + 60_000)).toBe(s.restSeconds);
    expect(restRemaining(s, T0 + 60_000 + 95_000)).toBe(0);
  });

  test("completing the last set of an exercise advances the pane and marks it done", () => {
    let s = make();
    for (let i = 0; i < 3; i++) s = loggerReducer(s, { type: "complete-set", at: T0 });
    expect(exerciseDone(s.exercises[0])).toBe(true);
    expect(s.activeIndex).toBe(1);
    expect(nextPending(s)).toEqual({ exercise: 1, set: 0 });
  });

  test("all sets done → progress 1 and no pending set", () => {
    let s = make();
    for (let i = 0; i < 5; i++) s = loggerReducer(s, { type: "complete-set", at: T0 });
    expect(progress(s)).toBe(1);
    expect(nextPending(s)).toBeNull();
  });

  test("undo un-completes a set and clears the rest timer", () => {
    let s = make();
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    s = loggerReducer(s, { type: "undo-set", exercise: 0, set: 0 });
    expect(s.exercises[0].sets[0].done).toBe(false);
    expect(s.restEndsAt).toBeNull();
    expect(doneSets(s)).toBe(0);
  });

  test("skipping the rest clears the timer without touching the sets", () => {
    let s = make();
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    s = loggerReducer(s, { type: "rest-skip" });
    expect(s.restEndsAt).toBeNull();
    expect(doneSets(s)).toBe(1);
  });
});

describe("logger — editing", () => {
  test("reps and RIR are clamped to sane bounds", () => {
    let s = make();
    s = loggerReducer(s, { type: "set-reps", exercise: 0, set: 0, value: 12 });
    expect(s.exercises[0].sets[0].reps).toBe(12);
    s = loggerReducer(s, { type: "set-reps", exercise: 0, set: 0, value: -5 });
    expect(s.exercises[0].sets[0].reps).toBe(0);
    s = loggerReducer(s, { type: "set-rir", exercise: 0, set: 0, value: 99 });
    expect(s.exercises[0].sets[0].rir).toBe(10);
  });

  test("add/remove set only touches the addressed exercise", () => {
    let s = make();
    s = loggerReducer(s, { type: "add-set", exercise: 0 });
    expect(s.exercises[0].sets).toHaveLength(4);
    expect(s.exercises[0].sets[3]).toEqual({ reps: 8, rir: 2, done: false });
    expect(s.exercises[1].sets).toHaveLength(2);
    s = loggerReducer(s, { type: "remove-set", exercise: 0 });
    expect(s.exercises[0].sets).toHaveLength(3);
  });

  test("a completed set is never silently dropped by remove-set", () => {
    let s = make();
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    s = loggerReducer(s, { type: "remove-set", exercise: 0 });
    s = loggerReducer(s, { type: "remove-set", exercise: 0 });
    s = loggerReducer(s, { type: "remove-set", exercise: 0 });
    expect(s.exercises[0].sets).toHaveLength(1);
    expect(s.exercises[0].sets[0].done).toBe(true);
  });

  test("skipping an exercise removes it from the totals and moves on", () => {
    let s = make();
    s = loggerReducer(s, { type: "toggle-skip", exercise: 0 });
    expect(s.exercises[0].skipped).toBe(true);
    expect(totalSets(s)).toBe(2);
    expect(s.activeIndex).toBe(1);
    expect(nextPending(s)).toEqual({ exercise: 1, set: 0 });
    s = loggerReducer(s, { type: "toggle-skip", exercise: 0 });
    expect(totalSets(s)).toBe(5);
  });

  test("an ad-hoc exercise is appended as `extra` and becomes the active pane", () => {
    let s = make();
    s = loggerReducer(s, {
      type: "add-exercise",
      exercise: { name: "Dumbbell Curl", muscles: [{ key: "biceps", load: 1 }], metric: "reps", defaultSets: 3, defaultReps: 12 },
    });
    expect(s.exercises).toHaveLength(3);
    expect(s.exercises[2]).toEqual(expect.objectContaining({ name: "Dumbbell Curl", source: "extra" }));
    expect(s.exercises[2].sets).toHaveLength(3);
    expect(s.activeIndex).toBe(2);
    expect(s.exercises[2].id).not.toBe(s.exercises[0].id);
  });

  test("focus is clamped to the exercise range", () => {
    let s = make();
    s = loggerReducer(s, { type: "focus", index: 9 });
    expect(s.activeIndex).toBe(1);
    s = loggerReducer(s, { type: "focus", index: -3 });
    expect(s.activeIndex).toBe(0);
  });
});

describe("logger — cardio", () => {
  test("segments can be added, edited and removed", () => {
    let s = make(RUN_DAY);
    const first = s.run!.segments[0].id;
    s = loggerReducer(s, { type: "segment-set", slot: "run", id: first, km: 4.2, min: 24 });
    expect(s.run!.segments[0]).toEqual(expect.objectContaining({ km: 4.2, min: 24 }));
    s = loggerReducer(s, { type: "segment-add", slot: "run" });
    expect(s.run!.segments).toHaveLength(2);
    s = loggerReducer(s, { type: "segment-remove", slot: "run", id: first });
    expect(s.run!.segments).toHaveLength(1);
    expect(s.run!.segments[0].id).not.toBe(first);
  });
});

describe("logger — derived summary", () => {
  test("muscle sets are load-weighted per muscle", () => {
    let s = make();
    for (let i = 0; i < 3; i++) s = loggerReducer(s, { type: "complete-set", at: T0 });
    const loads = muscleSets(s);
    expect(loads.chest).toBe(3);
    expect(loads.triceps).toBe(1.5);
    expect(loads.core).toBeUndefined(); // nothing logged yet
  });

  test("elapsed minutes are rounded from the start timestamp", () => {
    const s = make();
    expect(elapsedMinutes(s, T0 + 45 * 60_000 + 20_000)).toBe(45);
    expect(elapsedMinutes(s, T0)).toBe(0);
  });
});

describe("logger — the API payload", () => {
  test("only completed sets are sent, skipped exercises keep their flag", () => {
    let s = make();
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    s = loggerReducer(s, { type: "toggle-skip", exercise: 1 });
    s = loggerReducer(s, { type: "set-rpe", value: 8 });
    s = loggerReducer(s, { type: "set-notes", value: "  iyi geçti  " });
    const input = toCompleteInput(s, T0 + 50 * 60_000);

    expect(input.strength).toHaveLength(2);
    expect(input.strength[0]).toEqual(
      expect.objectContaining({ name: "Bench Press", source: "planned", skipped: false, plannedSets: 3, plannedReps: 8, plannedRIR: 2, metric: "reps" })
    );
    expect(input.strength[0].sets).toEqual([{ reps: 8, rir: 2 }]);
    expect(input.strength[1].skipped).toBe(true);
    expect(input.strength[1].sets).toEqual([]);
    expect(input.durationMin).toBe(50);
    expect(input.rpe).toBe(8);
    expect(input.notes).toBe("iyi geçti");
    expect(input.run).toBeNull();
  });

  test("cardio segments with no distance and no time are dropped", () => {
    let s = make(RUN_DAY);
    const first = s.run!.segments[0].id;
    s = loggerReducer(s, { type: "segment-set", slot: "run", id: first, km: 5.1, min: 29 });
    s = loggerReducer(s, { type: "segment-add", slot: "run" });
    s = loggerReducer(s, { type: "segment-set", slot: "run", id: s.run!.segments[1].id, km: 0, min: 0 });
    const input = toCompleteInput(s, T0 + 30 * 60_000);
    expect(input.run).toEqual({ segments: [{ km: 5.1, min: 29 }], targetKm: 5, targetMin: 30 });
    expect(input.strength).toEqual([]);
  });

  test("empty notes become null", () => {
    const s = make();
    expect(toCompleteInput(s, T0).notes).toBeNull();
  });
});

describe("logger — draft restore", () => {
  test("a draft for the same day and date is restored as-is", () => {
    let s = make();
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    const restored = restoreDraft(JSON.parse(JSON.stringify(s)), { dayOrder: 1, dateKey: "2026-09-10" });
    expect(restored).not.toBeNull();
    expect(doneSets(restored!)).toBe(1);
  });

  test("a draft from another day or another date is discarded", () => {
    const s = make();
    expect(restoreDraft(JSON.parse(JSON.stringify(s)), { dayOrder: 2, dateKey: "2026-09-10" })).toBeNull();
    expect(restoreDraft(JSON.parse(JSON.stringify(s)), { dayOrder: 1, dateKey: "2026-09-11" })).toBeNull();
    expect(restoreDraft(null, { dayOrder: 1, dateKey: "2026-09-10" })).toBeNull();
    expect(restoreDraft({ version: 99 }, { dayOrder: 1, dateKey: "2026-09-10" })).toBeNull();
  });
});
