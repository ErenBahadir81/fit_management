import mongoose from "mongoose";
import { exerciseNameKey } from "@fitfloow/core";
import { Exercise } from "../models/exercise";
import { Program, ProgramTemplate } from "../models/program";
import { SEED_EXERCISES, type SeedExercise } from "./data/exercises";

const MARKER = "catalog-activation-v1";

/** The seven muscle keys of v1 (the pre-3.0 app): every exercise-muscle pair counted in full. */
export const LEGACY_V1_MUSCLE_KEYS: readonly string[] = ["chest", "frontDelt", "sideDelt", "traps", "lats", "abs", "legs"];

/**
 * What v1's hard-coded catalog — and the 2.x seed that copied it — gave each exercise, every load 1.
 * An exercise still holding exactly this set is untouched legacy data; anything else is an edit.
 */
export const LEGACY_V1_EXERCISE_MUSCLES: Readonly<Record<string, readonly string[]>> = {
  "Push-up": ["chest", "frontDelt", "traps"],
  HSPU: ["chest", "frontDelt", "traps"],
  "Pike Push-up": ["frontDelt", "chest", "traps"],
  "DB Fly": ["chest"],
  Dips: ["chest", "frontDelt", "traps"],
  "Lateral Raise": ["sideDelt"],
  "Pull-up": ["lats"],
  Row: ["lats", "traps"],
  Shrug: ["traps"],
  "Leg Raises": ["abs"],
  Squat: ["legs"],
  Lunge: ["legs"],
  "Pistol Squat": ["legs"],
  "Calf Raise": ["legs"],
  Handstand: ["frontDelt", "sideDelt", "traps"],
  Plank: ["abs"],
  "Hollow Hold": ["abs"],
  "Wall Sit": ["legs"],
  Stretch: [],
  Mobility: [],
};

const LEGACY_BY_KEY = new Map(Object.entries(LEGACY_V1_EXERCISE_MUSCLES).map(([name, keys]) => [exerciseNameKey(name), keys]));

type Pair = { key: string; load: number };

/** Reads both stored shapes: v1 `string[]` (implicit load 1) and `{key, load}`. */
function pairs(input: unknown): Pair[] | null {
  if (!Array.isArray(input)) return null;
  const out: Pair[] = [];
  for (const m of input as unknown[]) {
    if (typeof m === "string") out.push({ key: m, load: 1 });
    else if (m && typeof (m as Pair).key === "string") out.push({ key: (m as Pair).key, load: typeof (m as Pair).load === "number" ? (m as Pair).load : 1 });
    else return null;
  }
  return out;
}

/**
 * Untouched legacy data: every load is 1 and every key is a v1 key (the rule agreed between T3
 * and T4), and — stricter, so an admin who only removed or added a v1 key keeps the edit — the
 * key set is exactly what v1 gave this exercise. Empty lists never count (nothing to upgrade).
 */
export function isUntouchedLegacy(name: string, muscles: unknown): boolean {
  const legacy = LEGACY_BY_KEY.get(exerciseNameKey(String(name ?? "")));
  const current = pairs(muscles);
  if (!legacy || legacy.length === 0 || !current || current.length !== legacy.length) return false;
  if (!current.every((m) => m.load === 1 && LEGACY_V1_MUSCLE_KEYS.includes(m.key))) return false;
  const have = [...current.map((m) => m.key)].sort();
  const want = [...legacy].sort();
  return have.every((k, i) => k === want[i]);
}

export interface CatalogSyncResult {
  /** Catalog rows inserted because no exercise had their slug or name. */
  added: number;
  /** Existing exercises whose untouched legacy loads were replaced by the v1 activation values. */
  upgraded: number;
  /** Program templates and user programs whose untouched legacy exercise snapshots were refreshed. */
  snapshots: number;
}

interface RawExercise {
  _id: mongoose.Types.ObjectId;
  name?: string;
  slug?: string | null;
  muscles?: unknown;
}

function isDuplicateOnly(e: unknown): boolean {
  const err = e as { code?: number; writeErrors?: Array<{ code?: number; err?: { code?: number } }> };
  if (err?.code === 11000 && !err.writeErrors) return true;
  return Array.isArray(err?.writeErrors) && err.writeErrors.length > 0 && err.writeErrors.every((w) => (w.code ?? w.err?.code) === 11000);
}

async function addAndUpgradeExercises(): Promise<Pick<CatalogSyncResult, "added" | "upgraded">> {
  const docs = (await Exercise.collection.find({}, { projection: { name: 1, slug: 1, muscles: 1 } }).toArray()) as RawExercise[];
  const bySlug = new Map<string, RawExercise>();
  const byName = new Map<string, RawExercise>();
  for (const d of docs) {
    if (typeof d.slug === "string" && d.slug) bySlug.set(d.slug, d);
    if (typeof d.name === "string") byName.set(exerciseNameKey(d.name), d);
  }

  const missing: SeedExercise[] = [];
  const updates: mongoose.mongo.AnyBulkWriteOperation[] = [];
  let upgraded = 0;
  for (const row of SEED_EXERCISES) {
    const doc = bySlug.get(row.slug) ?? byName.get(exerciseNameKey(row.name));
    if (!doc) {
      // A v1 exercise missing from a database that already has a catalog was deleted or renamed
      // by an admin before this sync: bringing it back would undo that edit.
      if (docs.length === 0 || !LEGACY_BY_KEY.has(exerciseNameKey(row.name))) missing.push(row);
      continue;
    }
    const set: Record<string, unknown> = {};
    if (!doc.slug) set.slug = row.slug;
    if (isUntouchedLegacy(doc.name ?? "", doc.muscles)) {
      set.muscles = row.muscles.map((m) => ({ key: m.key, load: m.load }));
      upgraded += 1;
    }
    if (Object.keys(set).length > 0) updates.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } });
  }
  if (updates.length > 0) await Exercise.collection.bulkWrite(updates, { ordered: false });

  let added = 0;
  if (missing.length > 0) {
    try {
      const res = await Exercise.insertMany(
        missing.map((e) => ({ ...e, nameKey: exerciseNameKey(e.name) })),
        { ordered: false }
      );
      added = res.length;
    } catch (e) {
      // Another booting instance inserted the same rows first (unique nameKey) — nothing is lost.
      if (!isDuplicateOnly(e)) throw e;
      added = (e as { insertedDocs?: unknown[] }).insertedDocs?.length ?? 0;
    }
  }
  return { added, upgraded };
}

interface RawDay {
  exercises?: Array<Record<string, unknown>>;
}

/**
 * The catalog as it stands after the exercise step, by name key: what an untouched legacy snapshot
 * should now say. That is the admin's value where an admin had already edited the row (so it was
 * not upgraded), and the activation value otherwise. Rows without muscles, or still legacy, are left out.
 */
async function liveCatalogMuscles(): Promise<Map<string, Pair[]>> {
  const docs = (await Exercise.collection.find({}, { projection: { name: 1, muscles: 1 } }).toArray()) as RawExercise[];
  const out = new Map<string, Pair[]>();
  for (const d of docs) {
    const muscles = pairs(d.muscles);
    if (typeof d.name !== "string" || !muscles || muscles.length === 0 || isUntouchedLegacy(d.name, d.muscles)) continue;
    out.set(exerciseNameKey(d.name), muscles);
  }
  return out;
}

/** Replaces untouched legacy snapshots with the live catalog's values; returns the new days or null. */
function refreshDays(days: unknown, live: Map<string, Pair[]>): RawDay[] | null {
  if (!Array.isArray(days)) return null;
  let changed = false;
  const next = (days as RawDay[]).map((day) => {
    if (!day || !Array.isArray(day.exercises)) return day;
    const exercises = day.exercises.map((ex) => {
      const name = String(ex?.name ?? "");
      const muscles = live.get(exerciseNameKey(name));
      if (!muscles || !isUntouchedLegacy(name, ex.muscles)) return ex;
      changed = true;
      return { ...ex, muscles: muscles.map((m) => ({ key: m.key, load: m.load })) };
    });
    return { ...day, exercises };
  });
  return changed ? next : null;
}

async function refreshSnapshots(): Promise<number> {
  const live = await liveCatalogMuscles();
  let n = 0;
  for (const model of [ProgramTemplate, Program] as const) {
    const col = model.collection;
    const ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
    // Every doc with an exercise: names are matched with `exerciseNameKey` folding, not exact case.
    const cursor = col.find({ "days.exercises.0": { $exists: true } }, { projection: { days: 1 } });
    for await (const doc of cursor) {
      const days = refreshDays(doc.days, live);
      // Filtering on the days that were read lets a concurrent edit (e.g. PUT /program during a
      // rolling deploy) win: its document no longer matches, so this write is skipped, not undone.
      if (days) ops.push({ updateOne: { filter: { _id: doc._id, days: doc.days }, update: { $set: { days } } } });
    }
    if (ops.length > 0) n += (await col.bulkWrite(ops, { ordered: false })).modifiedCount;
  }
  return n;
}

/**
 * One-time sync of an existing database to the activation-v1 catalog (T3/T4). Seeding is otherwise
 * insert-only-when-empty, so a database that has the 20 legacy exercises would never see the other
 * 123, and its legacy rows would keep counting every set in full (`legs` included).
 *
 * - adds every catalog exercise that no row matches by slug or name (`nameKey` folding) — except
 *   the v1 names on a database that already has a catalog (missing there = deleted/renamed by an admin),
 * - replaces `muscles` only on untouched legacy rows (see `isUntouchedLegacy`), never admin edits,
 * - links matched rows to their catalog slug (the admin panel shows the literature next to them),
 * - refreshes untouched legacy exercise snapshots in program templates and user programs with the
 *   catalog's resulting values (the admin's, where an admin had already edited the row).
 *
 * A marker document makes it run exactly once, so exercises an admin deletes, renames or edits
 * afterwards are never resurrected or overwritten. Idempotent either way.
 */
export async function syncExerciseCatalogV1(): Promise<CatalogSyncResult> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Veritabanı bağlantısı yok");
  const markers = db.collection<{ _id: string; at: Date }>("migrations");
  if (await markers.findOne({ _id: MARKER })) return { added: 0, upgraded: 0, snapshots: 0 };

  const { added, upgraded } = await addAndUpgradeExercises();
  const snapshots = await refreshSnapshots();
  await markers.updateOne({ _id: MARKER }, { $set: { at: new Date() } }, { upsert: true });
  return { added, upgraded, snapshots };
}
