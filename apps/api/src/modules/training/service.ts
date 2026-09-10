import type { QueryFilter } from "mongoose";
import { Types } from "mongoose";
import {
  buildCardioEntry,
  normalizeIndex,
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

/** The user's program as a hydrated document (for writes). */
export async function loadProgram(userId: string): Promise<HydratedDocument<ProgramDoc>> {
  const program = await Program.findOne({ userId });
  if (!program) throw new AppError(404, "NOT_FOUND", PROGRAM_MISSING);
  return program;
}

/** Pointer + day the program currently sits on. Throws when the program has no days. */
export function pointerDay(program: Pick<ProgramDoc, "days" | "currentIndex">): { index: number; day: DayDTO } {
  const len = program.days?.length ?? 0;
  if (len === 0) throw new AppError(409, "CONFLICT", "Program boş, önce günleri ekle");
  const index = normalizeIndex(program.currentIndex, len);
  return { index, day: program.days[index] };
}

/** Exercise catalog rows for the given names, keyed exactly like `nameKey` (lowercase name). */
export async function catalogFor(names: readonly string[]): Promise<Map<string, ExerciseDoc>> {
  const wanted = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return new Map();
  const docs = (await Exercise.find({ nameKey: { $in: wanted }, active: true }).lean()) as ExerciseDoc[];
  return new Map(docs.map((d) => [d.nameKey ?? d.name.toLowerCase(), d]));
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
 */
export function buildStrengthEntries(
  inputs: readonly StrengthInput[],
  day: DayDTO | null,
  catalog: Map<string, ExerciseDoc>
): StrengthEntryDTO[] {
  const planned = new Map<string, DayDTO["exercises"][number]>();
  for (const e of day?.exercises ?? []) planned.set(e.name.trim().toLowerCase(), e);

  return (inputs ?? []).map((raw) => {
    const name = String(raw.name ?? "").trim().slice(0, 80) || "Hareket";
    const key = name.toLowerCase();
    const plan = planned.get(key) ?? null;
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
      source: raw.source ?? (plan ? "planned" : "extra"),
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
