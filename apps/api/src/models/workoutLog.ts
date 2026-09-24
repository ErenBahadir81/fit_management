import mongoose, { Schema, model, type Model, type Types } from "mongoose";
import type { CardioEntryDTO, SetEntryDTO, StrengthEntryDTO, WorkoutLogDTO } from "@fitfloow/core";

/**
 * `weightKg` (C1) landed in 2.1: every set stored before it has no such field. `default: null`
 * covers hydrated reads, and `toSetEntryDTO` covers `.lean()` ones — a missing load is always
 * `null` ("bodyweight / not recorded"), never `0`.
 */
const SetEntrySchema = new Schema(
  { reps: { type: Number, required: true }, rir: { type: Number, default: null }, weightKg: { type: Number, default: null } },
  { _id: false }
);
const MuscleLoadSchema = new Schema({ key: { type: String, required: true }, load: { type: Number, default: 1 } }, { _id: false });

const StrengthEntrySchema = new Schema(
  {
    name: { type: String, required: true },
    muscles: { type: [MuscleLoadSchema], default: [] },
    plannedSets: { type: Number, default: 0 },
    plannedReps: { type: Number, default: 0 },
    plannedRIR: { type: Number, default: null },
    source: { type: String, enum: ["planned", "extra"], default: "planned" },
    skipped: { type: Boolean, default: false },
    metric: { type: String, enum: ["reps", "time", "stretch"], default: "reps" },
    sets: { type: [SetEntrySchema], default: [] },
  },
  { _id: false }
);

const CardioSegmentSchema = new Schema({ km: { type: Number, required: true }, min: { type: Number, required: true } }, { _id: false });
const CardioEntrySchema = new Schema(
  {
    segments: { type: [CardioSegmentSchema], default: [] },
    totalKm: { type: Number, default: 0 },
    totalMin: { type: Number, default: 0 },
    targetKm: { type: Number, default: 0 },
    targetMin: { type: Number, default: 0 },
  },
  { _id: false }
);

export interface WorkoutLogDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  programId: Types.ObjectId | null;
  date: Date;
  dateKey: string;
  /** The program day done (3.0+); `null` for breaks and pre-3.0 logs. */
  dayId?: string | null;
  dayOrder: number;
  /** The cycle pass this log belongs to (named `weekNumber` since v1). */
  weekNumber: number;
  /** 3.0+: a day off outside the plan — nothing done, the pointer did not move. */
  isBreak?: boolean;
  title: string;
  kind: "strength" | "run" | "swim" | "stretch" | "rest";
  isOffDay: boolean;
  strength: StrengthEntryDTO[];
  run: CardioEntryDTO | null;
  swim: CardioEntryDTO | null;
  durationMin: number | null;
  notes: string | null;
  rpe: number | null;
  /** Legacy (pre-3.0) pointer index before this log. */
  pointerBefore: number | null;
  /** 3.0+: the pointer (day id) before/after this log and the cycle count before it — for undo. */
  pointerBeforeId?: string | null;
  pointerAfterId?: string | null;
  cycleBefore?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const WorkoutLogSchema = new Schema<WorkoutLogDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", default: null },
    date: { type: Date, default: Date.now },
    dateKey: { type: String, required: true },
    dayId: { type: String, default: null },
    dayOrder: { type: Number, default: 0 },
    weekNumber: { type: Number, default: 1 },
    title: { type: String, default: "" },
    kind: { type: String, enum: ["strength", "run", "swim", "stretch", "rest"], default: "strength" },
    isOffDay: { type: Boolean, default: false },
    isBreak: { type: Boolean },
    strength: { type: [StrengthEntrySchema], default: [] },
    run: { type: CardioEntrySchema, default: null },
    swim: { type: CardioEntrySchema, default: null },
    durationMin: { type: Number, default: null },
    notes: { type: String, default: null },
    rpe: { type: Number, default: null },
    pointerBefore: { type: Number, default: null },
    pointerBeforeId: { type: String, default: null },
    pointerAfterId: { type: String, default: null },
    cycleBefore: { type: Number, default: null },
  },
  { timestamps: true }
);
WorkoutLogSchema.index({ userId: 1, date: -1 });
/**
 * One log per user per Türkiye day (B9): a second write for the same day is an edit, never a
 * second row. Pre-3.0 databases carry a non-unique index with the default name; the training
 * module's startup migration swaps it (see `modules/training/migrate.ts`).
 */
export const WORKOUT_DAY_INDEX = "userId_dateKey_unique";
WorkoutLogSchema.index({ userId: 1, dateKey: 1 }, { unique: true, name: WORKOUT_DAY_INDEX });

export const WorkoutLog: Model<WorkoutLogDoc> = (mongoose.models.WorkoutLog as Model<WorkoutLogDoc>) || model<WorkoutLogDoc>("WorkoutLog", WorkoutLogSchema);

/** Normalizes one set, filling in the load a pre-2.1 document simply does not have. */
export function toSetEntryDTO(s: Partial<SetEntryDTO> | null | undefined): SetEntryDTO {
  const weightKg = s?.weightKg;
  return {
    reps: typeof s?.reps === "number" ? s.reps : 0,
    rir: typeof s?.rir === "number" ? s.rir : null,
    weightKg: typeof weightKg === "number" && Number.isFinite(weightKg) ? weightKg : null,
  };
}

/**
 * Field-by-field on purpose: `l.strength` is a Mongoose DocumentArray on a hydrated log, and
 * spreading a subdocument copies its internals instead of its data.
 */
export function toStrengthEntryDTO(e: StrengthEntryDTO): StrengthEntryDTO {
  return {
    name: e.name,
    muscles: (e.muscles ?? []).map((m) => ({ key: m.key, load: m.load ?? 1 })),
    plannedSets: e.plannedSets ?? 0,
    plannedReps: e.plannedReps ?? 0,
    plannedRIR: e.plannedRIR ?? null,
    source: e.source ?? "planned",
    skipped: e.skipped ?? false,
    metric: e.metric ?? "reps",
    sets: (e.sets ?? []).map(toSetEntryDTO),
  };
}

export function toWorkoutLogDTO(l: WorkoutLogDoc): WorkoutLogDTO {
  return {
    id: String(l._id),
    date: l.date.toISOString(),
    dateKey: l.dateKey,
    dayId: l.dayId ?? null,
    dayOrder: l.dayOrder,
    cycleNumber: Math.max(1, l.weekNumber ?? 1),
    weekNumber: Math.max(1, l.weekNumber ?? 1),
    isBreak: typeof l.isBreak === "boolean" ? l.isBreak : l.isOffDay === true && !l.dayId,
    title: l.title,
    kind: l.kind,
    isOffDay: l.isOffDay,
    strength: (l.strength ?? []).map(toStrengthEntryDTO),
    run: l.run ?? null,
    swim: l.swim ?? null,
    durationMin: l.durationMin ?? null,
    notes: l.notes ?? null,
    rpe: l.rpe ?? null,
  };
}
