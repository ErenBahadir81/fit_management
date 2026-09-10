/**
 * PROGRAM — cycle pointer arithmetic and input normalization (pure).
 * The cycle length is *not* fixed (Eren 7 days, İnci 4): every pointer move is `% days.length`,
 * and a wrap bumps the week number. Undo restores the pointer stored on the log.
 */
import { clamp } from "../utils/index";
import type { CardioTargetDTO, DayDTO, DayKind, ExerciseMetric, ExerciseTargetDTO } from "../schemas/index";
import { normalizeMuscleLoads, type ProgramLike } from "./types";

const DAY_KINDS: readonly DayKind[] = ["strength", "run", "swim", "stretch", "rest"];
const METRICS: readonly ExerciseMetric[] = ["reps", "time", "stretch"];

/** Safe modulo — negative and out-of-range indexes fold back into `[0, length)`. */
export function normalizeIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length <= 0) return 0;
  const i = Math.trunc(index);
  return ((i % length) + length) % length;
}

export interface PointerState {
  currentIndex: number;
  weekNumber: number;
  wrapped: boolean;
}

/** Next day of the cycle; the week number increases when the cycle wraps to day 1. */
export function advancePointer(program: ProgramLike): PointerState {
  const len = program.days?.length ?? 0;
  const week = Math.max(1, Math.trunc(program.weekNumber ?? 1));
  if (len === 0) return { currentIndex: 0, weekNumber: week, wrapped: false };
  const from = normalizeIndex(program.currentIndex, len);
  const wrapped = from === len - 1;
  return { currentIndex: (from + 1) % len, weekNumber: wrapped ? week + 1 : week, wrapped };
}

/**
 * Undo: put the pointer back where it was before a completed session (`pointerBefore` on the log).
 * If that session was the last of the cycle, the week number is rolled back too.
 */
export function rewindPointer(program: ProgramLike, pointerBefore: number | null | undefined): PointerState {
  const len = program.days?.length ?? 0;
  const week = Math.max(1, Math.trunc(program.weekNumber ?? 1));
  if (len === 0 || pointerBefore === null || pointerBefore === undefined || !Number.isFinite(pointerBefore)) {
    return { currentIndex: normalizeIndex(program.currentIndex, len), weekNumber: week, wrapped: false };
  }
  const index = normalizeIndex(pointerBefore, len);
  const wrapped = index === len - 1;
  return { currentIndex: index, weekNumber: wrapped ? Math.max(1, week - 1) : week, wrapped };
}

/** Is `index` a real day of this program? */
export function isValidIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

/** Jump the pointer to an arbitrary day (week number untouched). */
export function jumpTo(program: ProgramLike, index: number): PointerState {
  const len = program.days?.length ?? 0;
  return { currentIndex: normalizeIndex(index, len), weekNumber: Math.max(1, Math.trunc(program.weekNumber ?? 1)), wrapped: false };
}

/** The day the pointer is on (null for an empty program). */
export function currentDay<T>(program: ProgramLike<T>): T | null {
  const len = program.days?.length ?? 0;
  if (len === 0) return null;
  return program.days[normalizeIndex(program.currentIndex, len)] ?? null;
}

/* ------------------------------ normalization ---------------------------- */

export interface CatalogExerciseLike {
  name: string;
  muscles?: ReadonlyArray<{ key: string; load?: number } | string>;
  metric?: string;
  defaultSets?: number;
  defaultReps?: number;
  active?: boolean;
}

export interface ExerciseTargetInputLike {
  name?: string;
  muscles?: ReadonlyArray<{ key: string; load?: number } | string>;
  targetSets?: number;
  targetReps?: number;
  targetRIR?: number | null;
  metric?: string;
}

export interface DayInputLike {
  order?: number;
  title?: string;
  focus?: string;
  kind?: string;
  exercises?: ReadonlyArray<ExerciseTargetInputLike>;
  run?: Partial<CardioTargetDTO> | null;
  swim?: Partial<CardioTargetDTO> | null;
}

/** Case-insensitive exercise lookup by name. */
export function catalogIndex(catalog: readonly CatalogExerciseLike[]): Map<string, CatalogExerciseLike> {
  const map = new Map<string, CatalogExerciseLike>();
  for (const e of catalog ?? []) {
    if (!e?.name || e.active === false) continue;
    map.set(e.name.trim().toLocaleLowerCase("tr"), e);
  }
  return map;
}

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function normalizeCardio(raw: Partial<CardioTargetDTO> | null | undefined): CardioTargetDTO | null {
  if (!raw) return null;
  const targetKm = clamp(Number(raw.targetKm) || 0, 0, 200);
  const targetMin = clamp(Number(raw.targetMin) || 0, 0, 1440);
  return { targetKm, targetMin, label: typeof raw.label === "string" ? raw.label.slice(0, 40) : "" };
}

export interface NormalizedProgram {
  days: DayDTO[];
  errors: string[];
}

/**
 * Fills in everything the client may omit and reports contract violations:
 * - `muscles` omitted → resolved from the exercise catalog by name (case-insensitive)
 * - `metric` omitted → the catalog's metric, else "reps"
 * - day orders must be 1..N (they are renumbered anyway so the data stays usable)
 * - an exercise that is neither in the catalog nor carries explicit muscles is an error
 */
export function normalizeProgramInput(
  days: ReadonlyArray<DayInputLike>,
  catalog: readonly CatalogExerciseLike[] = []
): NormalizedProgram {
  const index = catalogIndex(catalog);
  const errors: string[] = [];
  const list = days ?? [];

  const orders = list.map((d, i) => (Number.isFinite(d?.order) ? Math.trunc(d!.order as number) : i + 1));
  const ordersOk = orders.length > 0 && orders.every((o, i) => o === i + 1);
  if (!ordersOk) errors.push(`Gün sıraları 1..${list.length} olmalı`);

  const out = list.map((day, i) => {
    const kind = (DAY_KINDS as readonly string[]).includes(day?.kind ?? "") ? (day!.kind as DayKind) : "strength";
    const exercises: ExerciseTargetDTO[] = (day?.exercises ?? []).slice(0, 20).map((raw) => {
      const name = String(raw?.name ?? "").trim().slice(0, 80) || "Hareket";
      const found = index.get(name.toLocaleLowerCase("tr"));
      const explicit = raw?.muscles !== undefined;
      const muscles = explicit ? normalizeMuscleLoads(raw!.muscles) : normalizeMuscleLoads(found?.muscles);
      if (!explicit && !found) errors.push(`«${name}» katalogda yok, kaslarını elle seçmelisin`);
      const metric = (METRICS as readonly string[]).includes(raw?.metric ?? "")
        ? (raw!.metric as ExerciseMetric)
        : (METRICS as readonly string[]).includes(found?.metric ?? "")
          ? (found!.metric as ExerciseMetric)
          : "reps";
      return {
        name,
        muscles,
        targetSets: intIn(raw?.targetSets, 1, 20, found?.defaultSets ?? 3),
        targetReps: intIn(raw?.targetReps, 1, 600, found?.defaultReps ?? 10),
        targetRIR: raw?.targetRIR === null || raw?.targetRIR === undefined ? null : intIn(raw.targetRIR, 0, 10, 0),
        metric,
      };
    });
    return {
      order: i + 1,
      title: String(day?.title ?? "").trim().slice(0, 60) || `${i + 1}. Gün`,
      focus: String(day?.focus ?? "").trim().slice(0, 60),
      kind,
      exercises,
      run: normalizeCardio(day?.run),
      swim: normalizeCardio(day?.swim),
    };
  });

  return { days: out, errors };
}
