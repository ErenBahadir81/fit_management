import { Schema, model, models, type Model, type Types } from "mongoose";
import type { ExerciseDTO } from "@fitfloow/core";

export interface ExerciseDoc {
  _id: Types.ObjectId;
  name: string;
  nameKey: string; // lowercase for unique lookup
  muscles: Array<{ key: string; load: number }>;
  defaultSets: number;
  defaultReps: number;
  metric: "reps" | "time" | "stretch";
  kind: "strength" | "cardio" | "mobility";
  equipment: string[];
  instructions: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ExerciseSchema = new Schema<ExerciseDoc>(
  {
    name: { type: String, required: true },
    nameKey: { type: String, required: true, unique: true },
    muscles: { type: [{ key: String, load: { type: Number, default: 1 }, _id: false }], default: [] },
    defaultSets: { type: Number, default: 3 },
    defaultReps: { type: Number, default: 10 },
    metric: { type: String, enum: ["reps", "time", "stretch"], default: "reps" },
    kind: { type: String, enum: ["strength", "cardio", "mobility"], default: "strength" },
    equipment: { type: [String], default: [] },
    instructions: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Exercise: Model<ExerciseDoc> = (models.Exercise as Model<ExerciseDoc>) || model<ExerciseDoc>("Exercise", ExerciseSchema);

export function toExerciseDTO(e: ExerciseDoc): ExerciseDTO {
  return {
    id: String(e._id),
    name: e.name,
    muscles: (e.muscles ?? []).map((m) => ({ key: m.key, load: m.load ?? 1 })),
    defaultSets: e.defaultSets,
    defaultReps: e.defaultReps,
    metric: e.metric,
    kind: e.kind,
    equipment: e.equipment ?? [],
    instructions: e.instructions ?? "",
    active: e.active,
  };
}
