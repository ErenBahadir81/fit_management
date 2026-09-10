import mongoose from "mongoose";
import { DEFAULT_MASCOT_MESSAGES, DEFAULT_SETTINGS, trDateKey, type DayDTO } from "@fitfloow/core";
import { User } from "../models/user";
import { Muscle } from "../models/muscle";
import { Exercise } from "../models/exercise";
import { Program, ProgramTemplate } from "../models/program";
import { WorkoutLog } from "../models/workoutLog";
import { BodyEntry } from "../models/body";
import { DietTarget } from "../models/nutrition";
import { MascotMessage } from "../models/mascot";
import { Settings } from "../models/settings";
import { hashPassword } from "../modules/platform/auth.service";
import { EREN_DAYS, INCI_DAYS, SEED_EXERCISES, SEED_MUSCLES, SEED_TEMPLATES } from "./data/index";

export interface SeedReport {
  created: {
    users: number;
    muscles: number;
    exercises: number;
    templates: number;
    programs: number;
    mascotMessages: number;
    settings: number;
    foods: number;
  };
  migrated: {
    passwordPlain: number;
    userDefaults: number;
    programMuscles: number;
    workoutLogMuscles: number;
    workoutLogDateKeys: number;
    bodyEntryDateKeys: number;
    dietTargetModes: number;
  };
}

function emptyReport(): SeedReport {
  return {
    created: { users: 0, muscles: 0, exercises: 0, templates: 0, programs: 0, mascotMessages: 0, settings: 0, foods: 0 },
    migrated: {
      passwordPlain: 0,
      userDefaults: 0,
      programMuscles: 0,
      workoutLogMuscles: 0,
      workoutLogDateKeys: 0,
      bodyEntryDateKeys: 0,
      dietTargetModes: 0,
    },
  };
}

/** The two legacy accounts. Passwords are the v1 seed defaults; users change them from the app. */
const SEED_PASSWORD = "Asd*123";
const SEED_USERS = [
  { username: "eren", displayName: "Eren", role: "admin" as const, gender: "male" as const, heightCm: 178, days: EREN_DAYS, templateName: SEED_TEMPLATES[0].name },
  { username: "inci", displayName: "İnci", role: "user" as const, gender: "female" as const, heightCm: null, days: INCI_DAYS, templateName: SEED_TEMPLATES[1].name },
];

/** Raw (schema-less) access to a model's collection — legacy documents do not fit the v2 schemas. */
function raw(model: { collection: { collectionName: string } }) {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Veritabanı bağlantısı yok");
  return db.collection(model.collection.collectionName);
}

type LegacyMuscle = string | { key?: string; load?: number };

/** v1 stored `muscles: string[]` (implicit full load); v2 stores `[{key, load}]`. */
function normalizeMuscles(input: unknown): Array<{ key: string; load: number }> {
  if (!Array.isArray(input)) return [];
  const out: Array<{ key: string; load: number }> = [];
  for (const m of input as LegacyMuscle[]) {
    if (typeof m === "string") {
      if (m) out.push({ key: m, load: 1 });
      continue;
    }
    if (m && typeof m.key === "string" && m.key) out.push({ key: m.key, load: typeof m.load === "number" ? m.load : 1 });
  }
  return out;
}

function hasLegacyMuscles(input: unknown): boolean {
  return Array.isArray(input) && input.some((m) => typeof m === "string");
}

/* ------------------------------- users ---------------------------------- */

async function migrateUsers(report: SeedReport): Promise<void> {
  const users = raw(User);
  report.migrated.passwordPlain += (await users.updateMany({ passwordPlain: { $exists: true } }, { $unset: { passwordPlain: "" } })).modifiedCount;
  const defaults: Array<[string, unknown]> = [
    ["activityLevel", "moderate"],
    ["measurementDay", 0],
    ["mascotEnabled", true],
    ["unitSystem", "metric"],
    ["refreshTokens", []],
  ];
  for (const [field, value] of defaults) {
    const res = await users.updateMany({ $or: [{ [field]: { $exists: false } }, { [field]: null }] }, { $set: { [field]: value } });
    report.migrated.userDefaults += res.modifiedCount;
  }
}

async function ensureUsers(report: SeedReport): Promise<void> {
  for (const seed of SEED_USERS) {
    if (await User.exists({ username: seed.username })) continue;
    try {
      await User.create({
        username: seed.username,
        displayName: seed.displayName,
        passwordHash: await hashPassword(SEED_PASSWORD),
        role: seed.role,
        gender: seed.gender,
        heightCm: seed.heightCm,
      });
      report.created.users += 1;
    } catch (e) {
      // 11000 = another process created it first; nothing to do.
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
}

/* ------------------------------ catalogs -------------------------------- */

async function ensureCatalogs(report: SeedReport): Promise<void> {
  if ((await Muscle.countDocuments()) === 0) {
    await Muscle.insertMany(SEED_MUSCLES);
    report.created.muscles += SEED_MUSCLES.length;
  }
  if ((await Exercise.countDocuments()) === 0) {
    await Exercise.insertMany(SEED_EXERCISES.map((e) => ({ ...e, nameKey: e.name.trim().toLowerCase() })));
    report.created.exercises += SEED_EXERCISES.length;
  }
  if ((await ProgramTemplate.countDocuments()) === 0) {
    await ProgramTemplate.insertMany(SEED_TEMPLATES);
    report.created.templates += SEED_TEMPLATES.length;
  }
  if ((await MascotMessage.countDocuments()) === 0) {
    await MascotMessage.insertMany(DEFAULT_MASCOT_MESSAGES.map((m) => ({ ...m, active: true })));
    report.created.mascotMessages += DEFAULT_MASCOT_MESSAGES.length;
  }
  const settings = await Settings.updateOne({ _id: "global" }, { $setOnInsert: { data: DEFAULT_SETTINGS } }, { upsert: true });
  if (settings.upsertedCount) report.created.settings += 1;
}

/* ------------------------------ programs -------------------------------- */

async function ensurePrograms(report: SeedReport): Promise<void> {
  for (const seed of SEED_USERS) {
    const user = await User.findOne({ username: seed.username }).select({ _id: 1 }).lean();
    if (!user) continue;
    if (await Program.exists({ userId: user._id })) continue;
    const template = await ProgramTemplate.findOne({ name: seed.templateName }).lean();
    const days = (template?.days as DayDTO[] | undefined) ?? seed.days;
    await Program.create({
      userId: user._id,
      name: template?.name ?? seed.templateName,
      days,
      currentIndex: 0,
      weekNumber: 1,
      sourceTemplateId: template?._id ?? null,
    });
    report.created.programs += 1;
  }
}

/* ---------------------------- legacy migration --------------------------- */

async function migratePrograms(report: SeedReport): Promise<void> {
  const programs = raw(Program);
  const cursor = programs.find({ "days.exercises.muscles": { $type: "string" } });
  for await (const doc of cursor) {
    const days = (doc.days ?? []).map((day: Record<string, unknown>) => ({
      ...day,
      exercises: ((day.exercises as Array<Record<string, unknown>>) ?? []).map((ex) => ({ ...ex, muscles: normalizeMuscles(ex.muscles) })),
    }));
    await programs.updateOne({ _id: doc._id }, { $set: { days } });
    report.migrated.programMuscles += 1;
  }
}

async function migrateWorkoutLogs(report: SeedReport): Promise<void> {
  const logs = raw(WorkoutLog);
  const muscleCursor = logs.find({ "strength.muscles": { $type: "string" } });
  for await (const doc of muscleCursor) {
    const strength = ((doc.strength as Array<Record<string, unknown>>) ?? []).map((entry) =>
      hasLegacyMuscles(entry.muscles) ? { ...entry, muscles: normalizeMuscles(entry.muscles) } : entry
    );
    await logs.updateOne({ _id: doc._id }, { $set: { strength } });
    report.migrated.workoutLogMuscles += 1;
  }
  report.migrated.workoutLogDateKeys += await backfillDateKeys(WorkoutLog);
}

/** v1 had no `dateKey`; derive it from `date` in Türkiye local time. */
async function backfillDateKeys(model: { collection: { collectionName: string } }): Promise<number> {
  const col = raw(model);
  const cursor = col.find({ $or: [{ dateKey: { $exists: false } }, { dateKey: null }, { dateKey: "" }] });
  let n = 0;
  for await (const doc of cursor) {
    const at = (doc.date as Date | undefined) ?? (doc.createdAt as Date | undefined) ?? new Date();
    await col.updateOne({ _id: doc._id }, { $set: { dateKey: trDateKey(new Date(at)) } });
    n += 1;
  }
  return n;
}

async function migrateLegacy(report: SeedReport): Promise<void> {
  await migratePrograms(report);
  await migrateWorkoutLogs(report);
  report.migrated.bodyEntryDateKeys += await backfillDateKeys(BodyEntry);
  report.migrated.dietTargetModes += (
    await raw(DietTarget).updateMany({ $or: [{ mode: { $exists: false } }, { mode: null }] }, { $set: { mode: "manual" } })
  ).modifiedCount;
}

/* -------------------------------- foods ---------------------------------- */

/** Foods belong to the nutrition module (B4). Seed them only once that module ships its seeder. */
async function seedFoodsIfAvailable(report: SeedReport): Promise<void> {
  const spec = "../modules/nutrition/seed/index.js";
  try {
    const mod = (await import(/* @vite-ignore */ spec)) as { seedFoods?: () => Promise<number | void> };
    if (typeof mod.seedFoods !== "function") return;
    const inserted = await mod.seedFoods();
    report.created.foods += typeof inserted === "number" ? inserted : 0;
  } catch {
    /* not shipped yet — never block the rest of the seed */
  }
}

/**
 * Idempotent, layered seed + migration (owner: B1). Called at boot (SEED_ON_BOOT) and by `pnpm seed`.
 * Each step is isolated and never destroys existing data — see docs/plan/01-data-model.md §Migration.
 */
export async function runSeed(): Promise<SeedReport> {
  const report = emptyReport();
  await migrateUsers(report);
  await ensureUsers(report);
  await ensureCatalogs(report);
  await ensurePrograms(report);
  await migrateLegacy(report);
  await seedFoodsIfAvailable(report);
  return report;
}
