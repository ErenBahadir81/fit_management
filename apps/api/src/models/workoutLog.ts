import { Schema, model, models, type Model, type Types } from "mongoose";
import type { CardioEntryDTO, StrengthEntryDTO, WorkoutLogDTO } from "@fitfloow/core";

const SetEntrySchema = new Schema({ reps: { type: Number, required: true }, rir: { type: Number, default: null } }, { _id: false });
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
  dayOrder: number;
  weekNumber: number;
  title: string;
  kind: "strength" | "run" | "swim" | "stretch" | "rest";
  isOffDay: boolean;
  strength: StrengthEntryDTO[];
  run: CardioEntryDTO | null;
  swim: CardioEntryDTO | null;
  durationMin: number | null;
  notes: string | null;
  rpe: number | null;
  pointerBefore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const WorkoutLogSchema = new Schema<WorkoutLogDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    programId: { type: Schema.Types.ObjectId, ref: "Program", default: null },
    date: { type: Date, default: Date.now },
    dateKey: { type: String, required: true },
    dayOrder: { type: Number, default: 0 },
    weekNumber: { type: Number, default: 1 },
    title: { type: String, default: "" },
    kind: { type: String, enum: ["strength", "run", "swim", "stretch", "rest"], default: "strength" },
    isOffDay: { type: Boolean, default: false },
    strength: { type: [StrengthEntrySchema], default: [] },
    run: { type: CardioEntrySchema, default: null },
    swim: { type: CardioEntrySchema, default: null },
    durationMin: { type: Number, default: null },
    notes: { type: String, default: null },
    rpe: { type: Number, default: null },
    pointerBefore: { type: Number, default: null },
  },
  { timestamps: true }
);
WorkoutLogSchema.index({ userId: 1, date: -1 });
WorkoutLogSchema.index({ userId: 1, dateKey: 1 });

export const WorkoutLog: Model<WorkoutLogDoc> = (models.WorkoutLog as Model<WorkoutLogDoc>) || model<WorkoutLogDoc>("WorkoutLog", WorkoutLogSchema);

export function toWorkoutLogDTO(l: WorkoutLogDoc): WorkoutLogDTO {
  return {
    id: String(l._id),
    date: l.date.toISOString(),
    dateKey: l.dateKey,
    dayOrder: l.dayOrder,
    weekNumber: l.weekNumber,
    title: l.title,
    kind: l.kind,
    isOffDay: l.isOffDay,
    strength: l.strength ?? [],
    run: l.run ?? null,
    swim: l.swim ?? null,
    durationMin: l.durationMin ?? null,
    notes: l.notes ?? null,
    rpe: l.rpe ?? null,
  };
}
