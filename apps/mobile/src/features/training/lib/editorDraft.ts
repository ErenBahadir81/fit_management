/**
 * PROGRAM EDITOR DRAFT — the program being edited, as pure data plus one reducer.
 *
 * The editor never talks to the server while you work: every change lands here, the live volume
 * bars read `draftVolumeDays(draft)` on every render, and "Kaydet" sends `toProgramInput(draft)`
 * as one `PUT /program`. Days that came from the server carry their `id` back so the pointer and
 * the history stay on the same day (B5); days added here have `id: null` and go out without one.
 *
 * Switching a day's kind never throws its content away inside the session (tap "Dinlenme" by
 * mistake, tap "Güç" again, the exercises are still there); only what the kind actually uses is
 * counted and sent.
 */
import {
  WEEKDAY_TITLES_TR,
  WEEKLY_DAY_COUNT,
  type CardioTargetDTO,
  type DayKind,
  type ExerciseDTO,
  type ExerciseMetric,
  type ExerciseTargetDTO,
  type MuscleLoad,
  type ProgramDTO,
  type ProgramInput,
  type ProgramMode,
} from "@fitfloow/core";

/** The API accepts at most this many days (`zProgramInput`). */
export const MAX_DAYS = 14;
export const MAX_SETS = 20;
export const MAX_NAME = 60;

export interface DraftDay {
  /** Stable React key for this editing session (the id for server days, `new-<n>` otherwise). */
  key: string;
  /** Server id; `null` for a day added in this session. */
  id: string | null;
  title: string;
  focus: string;
  kind: DayKind;
  exercises: ExerciseTargetDTO[];
  run: CardioTargetDTO | null;
  swim: CardioTargetDTO | null;
}

export interface EditorDraft {
  name: string;
  mode: ProgramMode;
  days: DraftDay[];
  /** Source of `new-<n>` keys. */
  seq: number;
}

export type ExercisePatch = Partial<Pick<ExerciseTargetDTO, "targetSets" | "targetReps" | "targetRIR">>;

export type EditorAction =
  | { type: "rename-program"; name: string }
  | { type: "set-mode"; mode: ProgramMode }
  | { type: "add-day"; kind?: DayKind }
  | { type: "remove-day"; index: number }
  | { type: "move-day"; from: number; to: number }
  | { type: "rename-day"; index: number; title: string }
  | { type: "set-focus"; index: number; focus: string }
  | { type: "set-kind"; index: number; kind: DayKind }
  | { type: "set-cardio"; index: number; km: number; min: number }
  | { type: "add-exercise"; index: number; exercise: ExerciseTargetDTO }
  | { type: "remove-exercise"; index: number; exercise: number }
  | { type: "move-exercise"; index: number; from: number; to: number }
  | { type: "set-exercise"; index: number; exercise: number; patch: ExercisePatch };

export const KIND_TR: Record<DayKind, string> = {
  strength: "Güç",
  run: "Koşu",
  swim: "Yüzme",
  stretch: "Esneme",
  rest: "Dinlenme",
};

export const DEFAULT_CARDIO: Record<"run" | "swim", CardioTargetDTO> = {
  run: { targetKm: 5, targetMin: 30, label: "" },
  swim: { targetKm: 1, targetMin: 30, label: "" },
};

/** The editor's starting point: the program as the server has it. */
export function draftFromProgram(program: Pick<ProgramDTO, "name" | "mode" | "days">): EditorDraft {
  return {
    name: program.name ?? "",
    mode: program.mode === "weekly" ? "weekly" : "cycle",
    days: (program.days ?? []).map((d) => ({
      key: d.id,
      id: d.id,
      title: d.title,
      focus: d.focus ?? "",
      kind: d.kind,
      exercises: d.exercises.map((e) => ({ ...e })),
      run: d.run ? { ...d.run } : null,
      swim: d.swim ? { ...d.swim } : null,
    })),
    seq: 1,
  };
}

/** A catalog exercise as a program target: its own defaults, RIR 2 for rep work. */
export function targetFromExercise(exercise: Pick<ExerciseDTO, "name" | "muscles" | "defaultSets" | "defaultReps" | "metric">): ExerciseTargetDTO {
  return {
    name: exercise.name,
    muscles: exercise.muscles.map((m) => ({ ...m })),
    targetSets: clampInt(exercise.defaultSets, 1, MAX_SETS),
    targetReps: clampInt(exercise.defaultReps, 1, 600),
    targetRIR: exercise.metric === "time" ? null : 2,
    metric: exercise.metric,
  };
}

/** An exercise the catalog does not have: explicit muscles are required by the API. */
export function adHocTarget(name: string, muscles: MuscleLoad[], metric: ExerciseMetric = "reps"): ExerciseTargetDTO {
  return {
    name: name.trim(),
    muscles: muscles.filter((m) => m.load > 0).map((m) => ({ key: m.key, load: m.load })),
    targetSets: 3,
    targetReps: metric === "time" ? 30 : 10,
    targetRIR: metric === "time" ? null : 2,
    metric,
  };
}

/** What a day is called in this mode: weekly days are weekdays, cycle days are numbered. */
export function dayLabel(mode: ProgramMode, index: number): string {
  return mode === "weekly" ? (WEEKDAY_TITLES_TR[index] ?? `${index + 1}. gün`) : `${index + 1}. gün`;
}

/** Can another day be added? Weekly programs are exactly seven days. */
export function canAddDay(draft: EditorDraft): boolean {
  return draft.mode === "cycle" && draft.days.length < MAX_DAYS;
}

export function canRemoveDay(draft: EditorDraft): boolean {
  return draft.mode === "cycle" && draft.days.length > 1;
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list];
  const target = Math.min(list.length - 1, Math.max(0, to));
  if (target === from) return [...list];
  const next = [...list];
  const [row] = next.splice(from, 1);
  next.splice(target, 0, row);
  return next;
}

function newDay(key: string, kind: DayKind, title: string): DraftDay {
  return {
    key,
    id: null,
    title,
    focus: "",
    kind,
    exercises: [],
    run: kind === "run" ? { ...DEFAULT_CARDIO.run } : null,
    swim: kind === "swim" ? { ...DEFAULT_CARDIO.swim } : null,
  };
}

function mapDay(draft: EditorDraft, index: number, fn: (d: DraftDay) => DraftDay): EditorDraft {
  if (!draft.days[index]) return draft;
  return { ...draft, days: draft.days.map((d, i) => (i === index ? fn(d) : d)) };
}

export function editorReducer(draft: EditorDraft, action: EditorAction): EditorDraft {
  switch (action.type) {
    case "rename-program":
      return { ...draft, name: action.name.slice(0, MAX_NAME) };

    case "set-mode": {
      if (action.mode === draft.mode) return draft;
      if (action.mode === "cycle") return { ...draft, mode: "cycle" };
      // Weekly = Monday … Sunday. Missing weekdays become rest days; a longer cycle stays as it is
      // and `validateDraft` asks the user to pick which days to drop — the editor never deletes
      // someone's training day on its own.
      let seq = draft.seq;
      const days = [...draft.days];
      while (days.length < WEEKLY_DAY_COUNT) days.push(newDay(`new-${seq++}`, "rest", "Dinlenme"));
      return { ...draft, mode: "weekly", days, seq };
    }

    case "add-day": {
      if (!canAddDay(draft)) return draft;
      const kind = action.kind ?? "strength";
      const title = kind === "rest" ? "Dinlenme" : `${draft.days.length + 1}. gün`;
      return { ...draft, days: [...draft.days, newDay(`new-${draft.seq}`, kind, title)], seq: draft.seq + 1 };
    }

    case "remove-day": {
      // Weekly keeps its seven slots — except when switching from a longer cycle left extras.
      const weeklyExtra = draft.mode === "weekly" && draft.days.length > WEEKLY_DAY_COUNT;
      if (!(canRemoveDay(draft) || weeklyExtra) || !draft.days[action.index]) return draft;
      return { ...draft, days: draft.days.filter((_, i) => i !== action.index) };
    }

    case "move-day":
      return { ...draft, days: move(draft.days, action.from, action.to) };

    case "rename-day":
      return mapDay(draft, action.index, (d) => ({ ...d, title: action.title.slice(0, 40) }));

    case "set-focus":
      return mapDay(draft, action.index, (d) => ({ ...d, focus: action.focus.slice(0, 60) }));

    case "set-kind":
      return mapDay(draft, action.index, (d) => {
        if (d.kind === action.kind) return d;
        const run = action.kind === "run" ? (d.run ?? { ...DEFAULT_CARDIO.run }) : d.run;
        const swim = action.kind === "swim" ? (d.swim ?? { ...DEFAULT_CARDIO.swim }) : d.swim;
        return { ...d, kind: action.kind, run, swim };
      });

    case "set-cardio":
      return mapDay(draft, action.index, (d) => {
        if (d.kind !== "run" && d.kind !== "swim") return d;
        const km = Math.min(200, Math.max(0, Math.round(action.km * 10) / 10));
        const min = clampInt(action.min, 0, 1440);
        const prev = d[d.kind];
        return { ...d, [d.kind]: { targetKm: km, targetMin: min, label: prev?.label ?? "" } };
      });

    case "add-exercise":
      return mapDay(draft, action.index, (d) => ({ ...d, exercises: [...d.exercises, { ...action.exercise }] }));

    case "remove-exercise":
      return mapDay(draft, action.index, (d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== action.exercise) }));

    case "move-exercise":
      return mapDay(draft, action.index, (d) => ({ ...d, exercises: move(d.exercises, action.from, action.to) }));

    case "set-exercise":
      return mapDay(draft, action.index, (d) => ({
        ...d,
        exercises: d.exercises.map((e, i) => {
          if (i !== action.exercise) return e;
          const p = action.patch;
          return {
            ...e,
            targetSets: p.targetSets !== undefined ? clampInt(p.targetSets, 1, MAX_SETS) : e.targetSets,
            targetReps: p.targetReps !== undefined ? clampInt(p.targetReps, 1, 600) : e.targetReps,
            targetRIR: p.targetRIR !== undefined ? (p.targetRIR === null ? null : clampInt(p.targetRIR, 0, 10)) : e.targetRIR,
          };
        }),
      }));
  }
}

/** Only what each day's kind uses: a rest day has no exercises, a run day no swim target. */
function effectiveDay(d: DraftDay) {
  const lifts = d.kind === "strength" || d.kind === "stretch";
  return {
    title: d.title.trim(),
    focus: d.focus.trim(),
    kind: d.kind,
    exercises: lifts ? d.exercises : [],
    run: d.kind === "run" ? d.run : null,
    swim: d.kind === "swim" ? d.swim : null,
  };
}

/** The draft's days in the shape `programVolume` reads — what the live bars are computed from. */
export function draftVolumeDays(draft: EditorDraft) {
  return draft.days.map(effectiveDay);
}

/** The `PUT /program` body. Existing days send their id back; new ones omit it. */
export function toProgramInput(draft: EditorDraft): ProgramInput {
  const name = draft.name.trim();
  return {
    ...(name ? { name } : {}),
    mode: draft.mode,
    days: draft.days.map((d, i) => ({ ...(d.id ? { id: d.id } : {}), order: i + 1, ...effectiveDay(d) })),
  };
}

export interface DraftIssue {
  /** Day index, or `null` for the program as a whole. */
  day: number | null;
  message: string;
}

/** What stops "Kaydet". Empty = the server will accept it. */
export function validateDraft(draft: EditorDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (draft.days.length === 0) issues.push({ day: null, message: "En az bir gün ekle." });
  if (draft.days.length > MAX_DAYS) issues.push({ day: null, message: `En fazla ${MAX_DAYS} gün olabilir.` });
  if (draft.mode === "weekly" && draft.days.length > WEEKLY_DAY_COUNT) {
    const extra = draft.days.length - WEEKLY_DAY_COUNT;
    issues.push({ day: null, message: `Haftalık programda 7 gün olur. ${extra} günü sil ya da döngüye geri dön.` });
  }
  draft.days.forEach((d, i) => {
    if (!d.title.trim()) issues.push({ day: i, message: `${i + 1}. günün bir adı olmalı.` });
  });
  return issues;
}

/** Did anything change compared with where the editor started? */
export function isDirty(draft: EditorDraft, initial: EditorDraft): boolean {
  return JSON.stringify(toProgramInput(draft)) !== JSON.stringify(toProgramInput(initial));
}
