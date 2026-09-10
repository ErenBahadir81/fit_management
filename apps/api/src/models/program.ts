import { Schema, model, models, type Model, type Types } from "mongoose";
import type { DayDTO, ProgramDTO, ProgramTemplateDTO } from "@fitfloow/core";

const MuscleLoadSchema = new Schema({ key: { type: String, required: true }, load: { type: Number, default: 1 } }, { _id: false });

const ExerciseTargetSchema = new Schema(
  {
    name: { type: String, required: true },
    muscles: { type: [MuscleLoadSchema], default: [] },
    targetSets: { type: Number, default: 3 },
    targetReps: { type: Number, default: 10 },
    targetRIR: { type: Number, default: null },
    metric: { type: String, enum: ["reps", "time", "stretch"], default: "reps" },
  },
  { _id: false }
);

const CardioTargetSchema = new Schema(
  { targetKm: { type: Number, default: 5 }, targetMin: { type: Number, default: 30 }, label: { type: String, default: "" } },
  { _id: false }
);

export const DaySchema = new Schema(
  {
    order: { type: Number, required: true },
    title: { type: String, required: true },
    focus: { type: String, default: "" },
    kind: { type: String, enum: ["strength", "run", "swim", "stretch", "rest"], default: "strength" },
    exercises: { type: [ExerciseTargetSchema], default: [] },
    run: { type: CardioTargetSchema, default: null },
    swim: { type: CardioTargetSchema, default: null },
  },
  { _id: false }
);

export interface ProgramDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  days: DayDTO[];
  currentIndex: number;
  weekNumber: number;
  startedAt: Date;
  lastActionAt: Date;
  sourceTemplateId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ProgramSchema = new Schema<ProgramDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, default: "Haftalık Program" },
    days: { type: [DaySchema], default: [] },
    currentIndex: { type: Number, default: 0 },
    weekNumber: { type: Number, default: 1 },
    startedAt: { type: Date, default: Date.now },
    lastActionAt: { type: Date, default: Date.now },
    sourceTemplateId: { type: Schema.Types.ObjectId, ref: "ProgramTemplate", default: null },
  },
  { timestamps: true }
);

export const Program: Model<ProgramDoc> = (models.Program as Model<ProgramDoc>) || model<ProgramDoc>("Program", ProgramSchema);

export function toProgramDTO(p: ProgramDoc): ProgramDTO {
  return {
    id: String(p._id),
    name: p.name,
    days: p.days,
    currentIndex: p.currentIndex,
    weekNumber: p.weekNumber,
    startedAt: p.startedAt.toISOString(),
    lastActionAt: p.lastActionAt.toISOString(),
    sourceTemplateId: p.sourceTemplateId ? String(p.sourceTemplateId) : null,
  };
}

export interface ProgramTemplateDoc {
  _id: Types.ObjectId;
  name: string;
  description: string;
  days: DayDTO[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ProgramTemplateSchema = new Schema<ProgramTemplateDoc>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    days: { type: [DaySchema], default: [] },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const ProgramTemplate: Model<ProgramTemplateDoc> =
  (models.ProgramTemplate as Model<ProgramTemplateDoc>) || model<ProgramTemplateDoc>("ProgramTemplate", ProgramTemplateSchema);

export function toProgramTemplateDTO(t: ProgramTemplateDoc, weeklyVolume?: Record<string, number>): ProgramTemplateDTO {
  return {
    id: String(t._id),
    name: t.name,
    description: t.description ?? "",
    days: t.days,
    tags: t.tags ?? [],
    cycleLength: t.days.length,
    weeklyVolume,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
