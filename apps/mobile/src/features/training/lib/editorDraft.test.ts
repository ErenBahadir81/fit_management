import { normalizeProgramInput, zProgramInput, type ProgramDTO } from "@fitfloow/core";
import { EXERCISES, makeProgram } from "../../../lib/fake/fixtures";
import {
  adHocTarget,
  canAddDay,
  canRemoveDay,
  dayLabel,
  draftFromProgram,
  draftVolumeDays,
  editorReducer,
  isDirty,
  MAX_DAYS,
  targetFromExercise,
  toProgramInput,
  validateDraft,
  type EditorAction,
  type EditorDraft,
} from "./editorDraft";

const program: ProgramDTO = makeProgram("2026-09-24");
const run = (draft: EditorDraft, ...actions: EditorAction[]) => actions.reduce(editorReducer, draft);

describe("editor draft", () => {
  test("starts from the server program, every day keyed by its id", () => {
    const d = draftFromProgram(program);
    expect(d.mode).toBe("cycle");
    expect(d.days.map((x) => x.id)).toEqual(program.days.map((x) => x.id));
    expect(d.days.map((x) => x.key)).toEqual(program.days.map((x) => x.id));
    expect(isDirty(d, draftFromProgram(program))).toBe(false);
  });

  test("an untouched draft round-trips to a valid PUT body with every id", () => {
    const input = toProgramInput(draftFromProgram(program));
    expect(zProgramInput.safeParse(input).success).toBe(true);
    expect(input.days.map((d) => d.id)).toEqual(program.days.map((d) => d.id));
    expect(input.days.map((d) => d.order)).toEqual(program.days.map((_, i) => i + 1));
  });

  test("a new day goes out without an id and the server gives it a fresh one", () => {
    const d = run(draftFromProgram(program), { type: "add-day" });
    const input = toProgramInput(d);
    const added = input.days[input.days.length - 1];
    expect(added.id).toBeUndefined();
    expect(added.title).toBe(`${program.days.length + 1}. gün`);
    const { days, errors } = normalizeProgramInput(input.days, EXERCISES, { mode: "cycle", existingIds: program.days.map((x) => x.id) });
    expect(errors).toEqual([]);
    expect(days.slice(0, -1).map((x) => x.id)).toEqual(program.days.map((x) => x.id));
    expect(program.days.some((x) => x.id === days[days.length - 1].id)).toBe(false);
    expect(isDirty(d, draftFromProgram(program))).toBe(true);
  });

  test("two new days get distinct keys", () => {
    const d = run(draftFromProgram(program), { type: "add-day" }, { type: "add-day", kind: "rest" });
    const keys = d.days.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(d.days[d.days.length - 1]).toMatchObject({ kind: "rest", title: "Dinlenme", id: null });
  });

  test("days are renamed, removed and reordered — ids follow their day", () => {
    let d = draftFromProgram(program);
    d = run(d, { type: "rename-day", index: 0, title: "Push" }, { type: "move-day", from: 0, to: 2 }, { type: "remove-day", index: 0 });
    expect(d.days.map((x) => x.id)).toEqual(["d3", "d1", "d4", "d5", "d6"]);
    expect(d.days[1].title).toBe("Push");
    expect(toProgramInput(d).days.map((x) => x.order)).toEqual([1, 2, 3, 4, 5]);
  });

  test("moving out of range clamps, moving onto itself is a no-op", () => {
    const d = draftFromProgram(program);
    expect(run(d, { type: "move-day", from: 0, to: 99 }).days.map((x) => x.id)).toEqual(["d2", "d3", "d4", "d5", "d6", "d1"]);
    expect(run(d, { type: "move-day", from: 2, to: 2 }).days.map((x) => x.id)).toEqual(d.days.map((x) => x.id));
    expect(run(d, { type: "move-day", from: 9, to: 0 }).days.map((x) => x.id)).toEqual(d.days.map((x) => x.id));
  });

  test("the last day of a cycle cannot be removed", () => {
    let d = draftFromProgram({ ...program, days: [program.days[0]] });
    expect(canRemoveDay(d)).toBe(false);
    d = run(d, { type: "remove-day", index: 0 });
    expect(d.days).toHaveLength(1);
  });

  test("no more than the API's maximum of days", () => {
    let d = draftFromProgram(program);
    for (let i = 0; i < 20; i++) d = run(d, { type: "add-day" });
    expect(d.days).toHaveLength(MAX_DAYS);
    expect(canAddDay(d)).toBe(false);
  });

  test("exercises are added, edited within limits, reordered and removed", () => {
    const squat = EXERCISES.find((e) => e.id === "ex_squat")!;
    let d = draftFromProgram(program);
    d = run(d, { type: "add-exercise", index: 0, exercise: targetFromExercise(squat) });
    expect(d.days[0].exercises.at(-1)!.name).toBe("Squat");
    const last = d.days[0].exercises.length - 1;
    d = run(d, { type: "set-exercise", index: 0, exercise: last, patch: { targetSets: 99, targetReps: 0, targetRIR: 3 } });
    expect(d.days[0].exercises[last]).toMatchObject({ targetSets: 20, targetReps: 1, targetRIR: 3 });
    d = run(d, { type: "move-exercise", index: 0, from: last, to: 0 });
    expect(d.days[0].exercises[0].name).toBe("Squat");
    d = run(d, { type: "remove-exercise", index: 0, exercise: 0 });
    expect(d.days[0].exercises.map((e) => e.name)).toEqual(program.days[0].exercises.map((e) => e.name));
  });

  test("an ad-hoc exercise carries explicit muscles and passes the API's normalization", () => {
    const target = adHocTarget("  Landmine Press ", [
      { key: "chest", load: 1 },
      { key: "triceps", load: 0.5 },
      { key: "biceps", load: 0 },
    ]);
    expect(target).toMatchObject({ name: "Landmine Press", targetSets: 3, targetReps: 10, targetRIR: 2, metric: "reps" });
    expect(target.muscles).toEqual([
      { key: "chest", load: 1 },
      { key: "triceps", load: 0.5 },
    ]);
    const d = run(draftFromProgram(program), { type: "add-exercise", index: 0, exercise: target });
    const { errors } = normalizeProgramInput(toProgramInput(d).days, EXERCISES, { mode: "cycle", existingIds: program.days.map((x) => x.id) });
    expect(errors).toEqual([]);
    expect(adHocTarget("Duvar oturuşu", [{ key: "quads", load: 1 }], "time")).toMatchObject({ targetReps: 30, targetRIR: null, metric: "time" });
  });

  test("switching kind keeps the content in the session but sends only what the kind uses", () => {
    let d = draftFromProgram(program);
    d = run(d, { type: "set-kind", index: 0, kind: "rest" });
    expect(d.days[0].exercises.length).toBeGreaterThan(0); // still there if the user taps back
    expect(toProgramInput(d).days[0].exercises).toEqual([]);
    expect(draftVolumeDays(d)[0].exercises).toEqual([]);
    d = run(d, { type: "set-kind", index: 0, kind: "strength" });
    expect(toProgramInput(d).days[0].exercises.length).toBe(program.days[0].exercises.length);

    d = run(d, { type: "set-kind", index: 0, kind: "run" });
    expect(toProgramInput(d).days[0]).toMatchObject({ kind: "run", run: { targetKm: 5, targetMin: 30 }, swim: null, exercises: [] });
    d = run(d, { type: "set-cardio", index: 0, km: 7.25, min: 42 });
    expect(toProgramInput(d).days[0].run).toMatchObject({ targetKm: 7.3, targetMin: 42 });
  });

  test("weekly mode pads a short cycle with rest days, labelled by weekday", () => {
    const three = draftFromProgram({ ...program, days: program.days.slice(0, 3) });
    const d = run(three, { type: "set-mode", mode: "weekly" });
    expect(d.mode).toBe("weekly");
    expect(d.days).toHaveLength(7);
    expect(d.days.slice(3).every((x) => x.kind === "rest" && x.id === null)).toBe(true);
    expect(dayLabel("weekly", 0)).toBe("Pazartesi");
    expect(dayLabel("weekly", 6)).toBe("Pazar");
    expect(dayLabel("cycle", 2)).toBe("3. gün");
    expect(canAddDay(d)).toBe(false);
    expect(canRemoveDay(d)).toBe(false);
    expect(validateDraft(d)).toEqual([]);
    expect(zProgramInput.safeParse(toProgramInput(d)).success).toBe(true);
    // Back to a cycle keeps what the user now has.
    expect(run(d, { type: "set-mode", mode: "cycle" }).days).toHaveLength(7);
  });

  test("a longer cycle switched to weekly asks for days to be dropped, and allows exactly that", () => {
    let d = draftFromProgram(program);
    for (let i = 0; i < 2; i++) d = run(d, { type: "add-day" });
    d = run(d, { type: "set-mode", mode: "weekly" });
    expect(d.days).toHaveLength(8);
    expect(validateDraft(d)[0].message).toMatch(/7 gün/);
    d = run(d, { type: "remove-day", index: 7 });
    expect(d.days).toHaveLength(7);
    expect(validateDraft(d)).toEqual([]);
    // …and not one more.
    expect(run(d, { type: "remove-day", index: 0 }).days).toHaveLength(7);
  });

  test("a nameless day blocks saving", () => {
    const d = run(draftFromProgram(program), { type: "rename-day", index: 1, title: "   " });
    expect(validateDraft(d)).toEqual([{ day: 1, message: "2. günün bir adı olmalı." }]);
  });

  test("the program name is trimmed and optional", () => {
    expect(toProgramInput(run(draftFromProgram(program), { type: "rename-program", name: "  Yeni plan  " })).name).toBe("Yeni plan");
    expect(toProgramInput(run(draftFromProgram(program), { type: "rename-program", name: "  " })).name).toBeUndefined();
  });
});
