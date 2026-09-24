import type { DayDTO } from "@fitfloow/core";
import {
  activeSetIndex,
  createLoggerState,
  doneSets,
  elapsedMinutes,
  exerciseDone,
  exerciseTonnage,
  loggerReducer,
  muscleSets,
  nextPending,
  paneCount,
  progress,
  restoreDraft,
  toCompleteInput,
  totalSets,
  totalTonnage,
  type LoggerState,
} from "./logger";

const STRENGTH_DAY: DayDTO = {
  id: "d1",
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
  id: "d3",
  order: 3,
  title: "Koşu",
  focus: "Tempo",
  kind: "run",
  exercises: [],
  run: { targetKm: 5, targetMin: 30, label: "Tempo" },
  swim: null,
};

const MIXED_DAY: DayDTO = { ...STRENGTH_DAY, order: 4, run: { targetKm: 3, targetMin: 18, label: "" }, swim: { targetKm: 1, targetMin: 25, label: "" } };

const T0 = 1_757_000_000_000;

function make(day: DayDTO = STRENGTH_DAY): LoggerState {
  return createLoggerState({ day, dayIndex: 0, programId: "p_demo", weekNumber: 6, dateKey: "2026-09-10", startedAt: T0 });
}

describe("logger — creation", () => {
  test("seeds one pending set per target set with the planned reps/RIR and no load yet", () => {
    const s = make();
    expect(s.exercises).toHaveLength(2);
    expect(s.exercises[0].sets).toHaveLength(3);
    expect(s.exercises[0].sets[0]).toEqual({ reps: 8, rir: 2, weightKg: null, done: false });
    expect(s.exercises[1].sets[0]).toEqual({ reps: 45, rir: null, weightKg: null, done: false }); // metric "time" → seconds
    expect(s.exercises[0].source).toBe("planned");
    expect(totalSets(s)).toBe(5);
    expect(doneSets(s)).toBe(0);
    expect(progress(s)).toBe(0);
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
  test("completes the active set and moves focus to the next set", () => {
    let s = make();
    expect(activeSetIndex(s.exercises[0])).toBe(0);
    s = loggerReducer(s, { type: "complete-set", at: T0 + 60_000 });
    expect(s.exercises[0].sets[0].done).toBe(true);
    expect(doneSets(s)).toBe(1);
    expect(activeSetIndex(s.exercises[0])).toBe(1);
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

  test("undo un-completes a set", () => {
    let s = make();
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    s = loggerReducer(s, { type: "undo-set", exercise: 0, set: 0 });
    expect(s.exercises[0].sets[0].done).toBe(false);
    expect(doneSets(s)).toBe(0);
  });

  test("the reducer no longer owns rest timing — only the per-day default seconds", () => {
    const s = make();
    expect(s.restSeconds).toBeGreaterThan(0);
    expect(s).not.toHaveProperty("restEndsAt");
  });
});

describe("logger — weight", () => {
  test("set-weight records the load and clamps it to a sane range", () => {
    let s = make();
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 62.5 });
    expect(s.exercises[0].sets[0].weightKg).toBe(62.5);
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: -10 });
    expect(s.exercises[0].sets[0].weightKg).toBe(0);
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 5000 });
    expect(s.exercises[0].sets[0].weightKg).toBe(1000);
  });

  test("bodyweight is `null`, never 0", () => {
    let s = make();
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 40 });
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: null });
    expect(s.exercises[0].sets[0].weightKg).toBeNull();
  });

  test("a load carries forward to every set still to come", () => {
    let s = make();
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 60 });
    expect(s.exercises[0].sets.map((x) => x.weightKg)).toEqual([60, 60, 60]);
  });

  test("changing the load on a later set leaves the earlier ones alone", () => {
    let s = make();
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 60 });
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 1, value: 65 });
    expect(s.exercises[0].sets.map((x) => x.weightKg)).toEqual([60, 65, 65]);
  });

  test("carry-forward replaces a suggested load — typing 60 on set 1 means 60 all the way down", () => {
    let s = make();
    s = loggerReducer(s, { type: "prefill", exercise: 0, weightKg: 72.5, reps: 8 });
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 60 });
    expect(s.exercises[0].sets.map((x) => x.weightKg)).toEqual([60, 60, 60]);
  });

  test("a completed set keeps the load it was logged with", () => {
    let s = make();
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 60 });
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 1, value: 65 });
    expect(s.exercises[0].sets[0].weightKg).toBe(60);
    expect(s.exercises[0].sets[1].weightKg).toBe(65);
  });

  test("a new set inherits the load and reps of the one before it", () => {
    let s = make();
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 60 });
    s = loggerReducer(s, { type: "set-reps", exercise: 0, set: 2, value: 6 });
    s = loggerReducer(s, { type: "add-set", exercise: 0 });
    expect(s.exercises[0].sets[3]).toEqual({ reps: 6, rir: 2, weightKg: 60, done: false });
  });
});

describe("logger — the last-time reference", () => {
  test("prefill seeds the pending sets from last session without touching logged work", () => {
    let s = make();
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    s = loggerReducer(s, { type: "prefill", exercise: 0, weightKg: 70, reps: 10 });
    expect(s.exercises[0].sets[0]).toEqual(expect.objectContaining({ done: true, reps: 8, weightKg: null }));
    expect(s.exercises[0].sets[1]).toEqual(expect.objectContaining({ reps: 10, weightKg: 70 }));
    expect(s.exercises[0].sets[2]).toEqual(expect.objectContaining({ reps: 10, weightKg: 70 }));
  });

  test("prefill never overwrites a load the user already typed", () => {
    let s = make();
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 80 });
    s = loggerReducer(s, { type: "prefill", exercise: 0, weightKg: 70, reps: 10 });
    expect(s.exercises[0].sets.map((x) => x.weightKg)).toEqual([80, 80, 80]);
    expect(s.exercises[0].sets[0].reps).toBe(8); // reps stay on the plan once a load is set
  });

  test("prefill with no load is a no-op", () => {
    const s = make();
    expect(loggerReducer(s, { type: "prefill", exercise: 0, weightKg: null, reps: null })).toBe(s);
  });
});

describe("logger — tonnage", () => {
  test("tonnage is Σ reps × kg over the completed sets", () => {
    let s = make();
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 60 });
    s = loggerReducer(s, { type: "complete-set", at: T0 }); // 8 × 60
    s = loggerReducer(s, { type: "set-reps", exercise: 0, set: 1, value: 6 });
    s = loggerReducer(s, { type: "complete-set", at: T0 }); // 6 × 60
    expect(exerciseTonnage(s.exercises[0])).toBe(840);
    expect(totalTonnage(s)).toBe(840);
  });

  test("pending sets, bodyweight sets and skipped exercises add nothing", () => {
    let s = make();
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 60 });
    expect(totalTonnage(s)).toBe(0); // nothing completed yet
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    s = loggerReducer(s, { type: "complete-set", at: T0 }); // set 1 carries 60 kg forward
    s = loggerReducer(s, { type: "toggle-skip", exercise: 0 });
    expect(totalTonnage(s)).toBe(0);
    s = loggerReducer(s, { type: "toggle-skip", exercise: 0 });
    expect(totalTonnage(s)).toBe(960);
    // Plank is bodyweight: completing it moves no tonnage.
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    expect(exerciseTonnage(s.exercises[1])).toBe(0);
    expect(totalTonnage(s)).toBe(960);
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
    expect(s.exercises[0].sets[3]).toEqual({ reps: 8, rir: 2, weightKg: null, done: false });
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
});

describe("logger — the pager", () => {
  test("panes are the exercises plus one per cardio slot", () => {
    expect(paneCount(make())).toBe(2);
    expect(paneCount(make(RUN_DAY))).toBe(1);
    expect(paneCount(make(MIXED_DAY))).toBe(4);
  });

  test("focus addresses any pane, cardio included, and is clamped to the range", () => {
    let s = make(MIXED_DAY);
    s = loggerReducer(s, { type: "focus", index: 3 });
    expect(s.activeIndex).toBe(3); // the swim pane
    s = loggerReducer(s, { type: "focus", index: 9 });
    expect(s.activeIndex).toBe(3);
    s = loggerReducer(s, { type: "focus", index: -3 });
    expect(s.activeIndex).toBe(0);
  });

  test("logging from a cardio pane still finds the next pending strength set", () => {
    let s = make(MIXED_DAY);
    s = loggerReducer(s, { type: "focus", index: 2 });
    expect(nextPending(s)).toEqual({ exercise: 0, set: 0 });
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
  test("only completed sets are sent, with their load, and skipped exercises keep their flag", () => {
    let s = make();
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 60 });
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    s = loggerReducer(s, { type: "toggle-skip", exercise: 1 });
    s = loggerReducer(s, { type: "set-rpe", value: 8 });
    s = loggerReducer(s, { type: "set-notes", value: "  iyi geçti  " });
    const input = toCompleteInput(s, T0 + 50 * 60_000);

    expect(input.strength).toHaveLength(2);
    expect(input.strength[0]).toEqual(
      expect.objectContaining({ name: "Bench Press", source: "planned", skipped: false, plannedSets: 3, plannedReps: 8, plannedRIR: 2, metric: "reps" })
    );
    expect(input.strength[0].sets).toEqual([{ reps: 8, rir: 2, weightKg: 60 }]);
    expect(input.strength[1].skipped).toBe(true);
    expect(input.strength[1].sets).toEqual([]);
    expect(input.durationMin).toBe(50);
    expect(input.rpe).toBe(8);
    expect(input.notes).toBe("iyi geçti");
    expect(input.run).toBeNull();
  });

  test("a bodyweight set travels with `weightKg: null`, never 0", () => {
    let s = make();
    s = loggerReducer(s, { type: "focus", index: 1 });
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    expect(toCompleteInput(s, T0).strength[1].sets).toEqual([{ reps: 45, rir: null, weightKg: null }]);
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
    s = loggerReducer(s, { type: "set-weight", exercise: 0, set: 0, value: 60 });
    s = loggerReducer(s, { type: "complete-set", at: T0 });
    const restored = restoreDraft(JSON.parse(JSON.stringify(s)), { dayOrder: 1, dateKey: "2026-09-10" });
    expect(restored).not.toBeNull();
    expect(doneSets(restored!)).toBe(1);
    expect(totalTonnage(restored!)).toBe(480);
  });

  test("a v1 draft (no weightKg, a stale restEndsAt) migrates instead of crashing the screen", () => {
    const v1 = {
      version: 1,
      programId: "p_demo",
      dayIndex: 0,
      dayOrder: 1,
      title: "Üst Vücut A",
      focus: "Göğüs · Sırt",
      kind: "strength",
      weekNumber: 6,
      dateKey: "2026-09-10",
      startedAt: T0,
      exercises: [
        {
          id: "ex-0",
          name: "Bench Press",
          muscles: [{ key: "chest", load: 1 }],
          metric: "reps",
          plannedSets: 2,
          plannedReps: 8,
          plannedRIR: 2,
          source: "planned",
          skipped: false,
          sets: [
            { reps: 8, rir: 2, done: true },
            { reps: 8, rir: 2, done: false },
          ],
        },
      ],
      activeIndex: 0,
      run: null,
      swim: null,
      restSeconds: 90,
      restEndsAt: T0 + 90_000,
      rpe: null,
      notes: "",
      seq: 1,
    };

    const restored = restoreDraft(v1, { dayOrder: 1, dateKey: "2026-09-10" });
    expect(restored).not.toBeNull();
    expect(restored!.version).toBe(2);
    expect(restored).not.toHaveProperty("restEndsAt");
    expect(restored!.exercises[0].sets).toEqual([
      { reps: 8, rir: 2, weightKg: null, done: true },
      { reps: 8, rir: 2, weightKg: null, done: false },
    ]);
    expect(doneSets(restored!)).toBe(1);
    expect(totalTonnage(restored!)).toBe(0);
  });

  test("a draft from another day, another date or an unknown schema is discarded", () => {
    const s = make();
    expect(restoreDraft(JSON.parse(JSON.stringify(s)), { dayOrder: 2, dateKey: "2026-09-10" })).toBeNull();
    expect(restoreDraft(JSON.parse(JSON.stringify(s)), { dayOrder: 1, dateKey: "2026-09-11" })).toBeNull();
    expect(restoreDraft(null, { dayOrder: 1, dateKey: "2026-09-10" })).toBeNull();
    expect(restoreDraft({ version: 99 }, { dayOrder: 1, dateKey: "2026-09-10" })).toBeNull();
    expect(restoreDraft({ version: 1 }, { dayOrder: 1, dateKey: "2026-09-10" })).toBeNull();
  });

  test("a draft is matched by day id when it has one, so reordering the program keeps it", () => {
    const s = JSON.parse(JSON.stringify(make()));
    expect(s.dayId).toBe("d1");
    // Day d1 moved to position 3: same id → restored; another id at the old position → dropped.
    expect(restoreDraft(s, { dayOrder: 3, dayId: "d1", dateKey: "2026-09-10" })).not.toBeNull();
    expect(restoreDraft(s, { dayOrder: 1, dayId: "d9", dateKey: "2026-09-10" })).toBeNull();
    // A pre-3.0 draft (no id) falls back to the order.
    const { dayId: _drop, ...legacy } = s;
    expect(restoreDraft(legacy, { dayOrder: 1, dayId: "d1", dateKey: "2026-09-10" })).not.toBeNull();
  });
});
