import type { QueryFilter } from "mongoose";
import { Types } from "mongoose";
import {
  buildCardioEntry,
  ensureDayIds,
  exerciseNameKey,
  pointerOf,
  trDateKey,
  weekKeyFor,
  type CardioEntryDTO,
  type CompleteWorkoutInput,
  type DayDTO,
  type SetEntryDTO,
  type StrengthEntryDTO,
  type Weekday,
} from "@fitfloow/core";
import { AppError } from "../../lib/errors";
import { Program, type ProgramDoc } from "../../models/program";
import { WorkoutLog, type WorkoutLogDoc } from "../../models/workoutLog";
import { Exercise, type ExerciseDoc } from "../../models/exercise";
import { User } from "../../models/user";
import { invalidateWeeklyReports } from "../../models/goal";
import type { HydratedDocument } from "mongoose";

export const PROGRAM_MISSING = "Program yok";

/**
 * Brings a stored program up to 3.0 in place: every day gets an id (`d<order>` for legacy days,
 * matching how legacy logs are read) and the pointer is held by id. Returns whether it changed.
 */
export function upgradeProgramDoc(program: HydratedDocument<ProgramDoc>): boolean {
  const plain = program.days.map((d) => {
    const raw = d as DayDTO & { toObject?: () => DayDTO };
    return typeof raw.toObject === "function" ? raw.toObject() : raw;
  });
  const days = ensureDayIds(plain);
  let changed = days.some((d, i) => d.id !== plain[i]?.id);
  if (changed) {
    program.days = days;
    program.markModified("days");
  }
  const pointer = pointerOf({ days, currentDayId: program.currentDayId, currentIndex: program.currentIndex, cycleNumber: program.cycleNumber, weekNumber: program.weekNumber });
  if (program.currentDayId !== pointer.currentDayId || program.currentIndex !== pointer.currentIndex || program.cycleNumber !== pointer.cycleNumber) {
    setPointer(program, pointer);
    changed = true;
  }
  if (!program.mode) {
    program.mode = "cycle";
    changed = true;
  }
  return changed;
}

/** Writes a pointer state, keeping the legacy mirrors (`currentIndex`, `weekNumber`) in sync. */
export function setPointer(program: HydratedDocument<ProgramDoc>, p: { currentDayId: string | null; currentIndex: number; cycleNumber: number }): void {
  program.currentDayId = p.currentDayId;
  program.currentIndex = p.currentIndex;
  program.cycleNumber = p.cycleNumber;
  program.weekNumber = p.cycleNumber;
}

/** The user's program as a hydrated, 3.0-shaped document (for writes). */
export async function loadProgram(userId: string): Promise<HydratedDocument<ProgramDoc>> {
  const program = await Program.findOne({ userId });
  if (!program) throw new AppError(404, "NOT_FOUND", PROGRAM_MISSING);
  if (upgradeProgramDoc(program)) await program.save();
  return program;
}

export function assertHasDays(program: Pick<ProgramDoc, "days">): void {
  if ((program.days?.length ?? 0) === 0) throw new AppError(409, "CONFLICT", "Program boş, önce günleri ekle");
}

/**
 * Exercise catalog rows for the given names, keyed by `exerciseNameKey` (B8). Queries both the
 * current key and the pre-3.0 one (`toLowerCase`) so rows not yet re-keyed are still found.
 */
export async function catalogFor(names: readonly string[]): Promise<Map<string, ExerciseDoc>> {
  const clean = names.map((n) => String(n ?? "").trim()).filter(Boolean);
  const wanted = [...new Set(clean.flatMap((n) => [exerciseNameKey(n), n.toLowerCase()]))];
  if (wanted.length === 0) return new Map();
  const docs = (await Exercise.find({ nameKey: { $in: wanted }, active: true }).lean()) as ExerciseDoc[];
  return new Map(docs.map((d) => [exerciseNameKey(d.name), d]));
}

/** The whole active catalog (program editing needs to resolve every name the client sends). */
export async function fullCatalog(): Promise<ExerciseDoc[]> {
  return (await Exercise.find({ active: true }).lean()) as ExerciseDoc[];
}

export async function measurementDayOf(userId: string): Promise<Weekday> {
  const user = await User.findById(userId).select("measurementDay").lean();
  return ((user?.measurementDay ?? 0) as Weekday) ?? 0;
}

/** Every log write must drop the cached weekly report of the week it belongs to. */
export async function invalidateWeeks(userId: string | Types.ObjectId, dateKeys: string[], measurementDay: Weekday): Promise<void> {
  const keys = [...new Set(dateKeys.filter(Boolean).map((k) => weekKeyFor(k, measurementDay)))];
  await invalidateWeeklyReports(userId, keys);
}

type StrengthInput = CompleteWorkoutInput["strength"][number];

/**
 * Resolves a logged exercise into a self-contained entry:
 * muscles come from the payload → the catalog → the planned day, in that order, so an admin
 * catalog edit is picked up immediately while ad-hoc exercises keep what the client sent.
 * Planned targets come from the payload → the entry being edited (`previous`, B6) → the
 * planned day, so editing a log after the fact never loses what was planned.
 */
export function buildStrengthEntries(
  inputs: readonly StrengthInput[],
  day: DayDTO | null,
  catalog: Map<string, ExerciseDoc>,
  previous: readonly StrengthEntryDTO[] = []
): StrengthEntryDTO[] {
  const planned = new Map<string, DayDTO["exercises"][number]>();
  for (const e of day?.exercises ?? []) planned.set(exerciseNameKey(e.name), e);
  const before = new Map<string, StrengthEntryDTO>();
  for (const e of previous ?? []) if (e?.name && !before.has(exerciseNameKey(e.name))) before.set(exerciseNameKey(e.name), e);

  return (inputs ?? []).map((raw) => {
    const name = String(raw.name ?? "").trim().slice(0, 80) || "Hareket";
    const key = exerciseNameKey(name);
    const prev = before.get(key) ?? null;
    const planEx = planned.get(key) ?? null;
    // What was planned *when the session was logged* beats today's (possibly edited) day.
    const plan =
      prev && prev.source === "planned"
        ? { targetSets: prev.plannedSets, targetReps: prev.plannedReps, targetRIR: prev.plannedRIR, muscles: prev.muscles, metric: prev.metric }
        : planEx
          ? { targetSets: planEx.targetSets, targetReps: planEx.targetReps, targetRIR: planEx.targetRIR, muscles: planEx.muscles, metric: planEx.metric }
          : null;
    const cat = catalog.get(key) ?? null;
    const muscles =
      raw.muscles !== undefined
        ? raw.muscles
        : cat
          ? cat.muscles.map((m) => ({ key: m.key, load: m.load ?? 1 }))
          : (plan?.muscles ?? []);
    const skipped = raw.skipped ?? false;
    const sets: SetEntryDTO[] = skipped ? [] : (raw.sets ?? []).slice(0, 40);
    return {
      name,
      muscles,
      plannedSets: raw.plannedSets ?? plan?.targetSets ?? 0,
      plannedReps: raw.plannedReps ?? plan?.targetReps ?? 0,
      plannedRIR: raw.plannedRIR !== undefined ? raw.plannedRIR : (plan?.targetRIR ?? null),
      source: raw.source ?? prev?.source ?? (plan ? "planned" : "extra"),
      skipped,
      metric: raw.metric ?? cat?.metric ?? plan?.metric ?? "reps",
      sets,
    };
  });
}

/** Cardio entry for a slot, defaulting the targets to the planned day's. */
export function buildCardio(
  input: CompleteWorkoutInput["run"],
  target: { targetKm: number; targetMin: number } | null
): CardioEntryDTO | null {
  if (!input) return null;
  return buildCardioEntry(input.segments ?? [], input.targetKm ?? target?.targetKm ?? 0, input.targetMin ?? target?.targetMin ?? 0);
}

/** Today's log (Türkiye day) as a hydrated document. */
export async function todayLogDoc(userId: string, now: Date): Promise<HydratedDocument<WorkoutLogDoc> | null> {
  return WorkoutLog.findOne({ userId, dateKey: trDateKey(now) }).sort({ date: -1 });
}

/** Path ids that are not ObjectIds simply do not exist. */
export function objectIdOrNotFound(value: string, what = "Kayıt"): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw AppError.notFound(what);
  return new Types.ObjectId(value);
}

export interface WorkoutQuery {
  from?: string;
  to?: string;
  limit?: number;
  before?: string;
}

export function workoutFilter(userId: string, q: WorkoutQuery): QueryFilter<WorkoutLogDoc> {
  const filter: QueryFilter<WorkoutLogDoc> = { userId: new Types.ObjectId(userId) };
  if (q.from || q.to) {
    filter.dateKey = {
      ...(q.from ? { $gte: q.from } : {}),
      ...(q.to ? { $lte: q.to } : {}),
    };
  }
  if (q.before) {
    if (!Types.ObjectId.isValid(q.before)) throw AppError.validation("Geçersiz imleç (before)");
    filter._id = { $lt: new Types.ObjectId(q.before) };
  }
  return filter;
}
