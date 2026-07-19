import { Schema, model, models, Model, Types } from "mongoose";

const DAY_KINDS = ["strength", "run", "swim", "stretch"];
const METRICS = ["reps", "time", "stretch"];

/* ------------------------------- User ------------------------------- */
const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true },
    passwordHash: { type: String, required: true },
    /** Yönetim panelinde gösterim için düz metin kopya (yalnız admin görür). */
    passwordPlain: { type: String, default: null },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    gender: { type: String, enum: ["male", "female"], default: "male" },
    heightCm: { type: Number, default: null },
  },
  { timestamps: true }
);
export const User: Model<any> = models.User || model("User", UserSchema);

/* ------------------------------ Program ----------------------------- */
const ExerciseTargetSchema = new Schema(
  {
    name: { type: String, required: true },
    muscles: { type: [String], default: [] },
    targetSets: { type: Number, default: 3 },
    targetReps: { type: Number, default: 10 },
    targetRIR: { type: Number, default: null },
    metric: { type: String, enum: METRICS, default: "reps" },
  },
  { _id: false }
);

const RunTargetSchema = new Schema(
  {
    targetKm: { type: Number, default: 5 },
    targetMin: { type: Number, default: 30 },
    label: { type: String, default: "" },
  },
  { _id: false }
);

const DaySchema = new Schema(
  {
    order: { type: Number, required: true }, // 1..N
    title: { type: String, required: true },
    focus: { type: String, default: "" },
    kind: { type: String, enum: DAY_KINDS, default: "strength" },
    exercises: { type: [ExerciseTargetSchema], default: [] },
    run: { type: RunTargetSchema, default: null },
    swim: { type: RunTargetSchema, default: null },
  },
  { _id: false }
);

const ProgramSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, default: "Haftalık Program" },
    days: { type: [DaySchema], default: [] },
    currentIndex: { type: Number, default: 0 }, // sıradaki yapılacak gün (0..days.length-1)
    weekNumber: { type: Number, default: 1 },
    startedAt: { type: Date, default: Date.now },
    lastActionAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
export const Program: Model<any> = models.Program || model("Program", ProgramSchema);

/* ---------------------------- WorkoutLog ---------------------------- */
const SetEntrySchema = new Schema(
  { reps: { type: Number, required: true }, rir: { type: Number, default: null } },
  { _id: false }
);

const StrengthEntrySchema = new Schema(
  {
    name: { type: String, required: true },
    muscles: { type: [String], default: [] },
    plannedSets: { type: Number, default: 0 },
    plannedReps: { type: Number, default: 0 },
    plannedRIR: { type: Number, default: null },
    source: { type: String, enum: ["planned", "extra"], default: "planned" },
    skipped: { type: Boolean, default: false },
    metric: { type: String, enum: METRICS, default: "reps" },
    sets: { type: [SetEntrySchema], default: [] },
  },
  { _id: false }
);

const RunSegmentSchema = new Schema(
  { km: { type: Number, required: true }, min: { type: Number, required: true } },
  { _id: false }
);

const RunEntrySchema = new Schema(
  {
    segments: { type: [RunSegmentSchema], default: [] },
    totalKm: { type: Number, default: 0 },
    totalMin: { type: Number, default: 0 },
    targetKm: { type: Number, default: 0 },
    targetMin: { type: Number, default: 0 },
  },
  { _id: false }
);

const WorkoutLogSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    programId: { type: Types.ObjectId, ref: "Program" },
    date: { type: Date, default: Date.now, index: true },
    dayOrder: { type: Number, default: 0 },
    weekNumber: { type: Number, default: 1 },
    title: { type: String, default: "" },
    kind: { type: String, enum: DAY_KINDS, default: "strength" },
    isOffDay: { type: Boolean, default: false },
    strength: { type: [StrengthEntrySchema], default: [] },
    run: { type: RunEntrySchema, default: null },
    swim: { type: RunEntrySchema, default: null },
  },
  { timestamps: true }
);
export const WorkoutLog: Model<any> =
  models.WorkoutLog || model("WorkoutLog", WorkoutLogSchema);

/* ----------------------------- BodyEntry ---------------------------- */
const BodyEntrySchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, default: Date.now, index: true },
    gender: { type: String, enum: ["male", "female"], required: true },
    heightCm: { type: Number, required: true },
    neckCm: { type: Number, required: true },
    waistCm: { type: Number, required: true },
    hipCm: { type: Number, default: null },
    weightKg: { type: Number, required: true },
    bodyFatPct: { type: Number, required: true },
    fatMassKg: { type: Number, required: true },
    leanMassKg: { type: Number, required: true },
  },
  { timestamps: true }
);
export const BodyEntry: Model<any> =
  models.BodyEntry || model("BodyEntry", BodyEntrySchema);

/* ------------------------------- Diet ------------------------------- */
const DietTargetSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, unique: true },
    calories: { type: Number, default: 2400 },
    protein: { type: Number, default: 160 },
    carbs: { type: Number, default: 240 },
    fat: { type: Number, default: 70 },
  },
  { timestamps: true }
);
export const DietTarget: Model<any> =
  models.DietTarget || model("DietTarget", DietTargetSchema);

const DietItemSchema = new Schema(
  {
    name: { type: String, required: true },
    qty: { type: Number, default: 1 },
    calories: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },
    fat: { type: Number, default: 0 },
    meal: {
      type: String,
      enum: ["breakfast", "lunch", "dinner", "snack"],
      default: "snack",
    },
  },
  { _id: false }
);

const DietLogSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    dateKey: { type: String, required: true }, // YYYY-MM-DD
    items: { type: [DietItemSchema], default: [] },
  },
  { timestamps: true }
);
DietLogSchema.index({ userId: 1, dateKey: 1 }, { unique: true });
export const DietLog: Model<any> = models.DietLog || model("DietLog", DietLogSchema);
