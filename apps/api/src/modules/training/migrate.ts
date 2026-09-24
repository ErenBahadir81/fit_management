import type { FastifyBaseLogger } from "fastify";
import { exerciseNameKey } from "@fitfloow/core";
import { Exercise } from "../../models/exercise";
import { WORKOUT_DAY_INDEX, WorkoutLog } from "../../models/workoutLog";

/** The pre-3.0, non-unique (userId, dateKey) index Mongoose created with its default name. */
const LEGACY_DAY_INDEX = "userId_1_dateKey_1";

/**
 * B9: one log per user per day. A pre-3.0 database has the same key pattern as a plain index,
 * which blocks the unique one, so it is swapped here — but only when no user already has two
 * logs on one day. Those duplicates were written by the old bugs; deleting user data at boot is
 * not something to do silently, so they are reported and the swap waits for a human.
 */
export async function ensureUniqueWorkoutDay(log: Pick<FastifyBaseLogger, "info" | "warn">): Promise<"created" | "exists" | "blocked"> {
  const col = WorkoutLog.collection;
  const indexes = await col.indexes().catch(() => [] as Array<{ name?: string }>);
  if (indexes.some((i) => i.name === WORKOUT_DAY_INDEX)) return "exists";

  const dupes = await col
    .aggregate<{ _id: unknown; n: number }>([
      { $group: { _id: { userId: "$userId", dateKey: "$dateKey" }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();
  if (dupes.length > 0) {
    log.warn({ sample: dupes }, "workout logs: some users have two logs on one day; unique (userId, dateKey) index not created");
    return "blocked";
  }
  if (indexes.some((i) => i.name === LEGACY_DAY_INDEX)) await col.dropIndex(LEGACY_DAY_INDEX);
  await col.createIndex({ userId: 1, dateKey: 1 }, { unique: true, name: WORKOUT_DAY_INDEX });
  log.info("workout logs: unique (userId, dateKey) index created");
  return "created";
}

/** B8: re-key exercises whose stored `nameKey` predates `exerciseNameKey` (I/İ/ı folding). */
export async function rekeyExercises(log: Pick<FastifyBaseLogger, "info" | "warn">): Promise<number> {
  const docs = await Exercise.find({}).select({ name: 1, nameKey: 1 }).lean();
  let n = 0;
  for (const d of docs) {
    const key = exerciseNameKey(d.name);
    if (d.nameKey === key) continue;
    try {
      await Exercise.updateOne({ _id: d._id }, { $set: { nameKey: key } });
      n += 1;
    } catch (e) {
      log.warn({ err: e, name: d.name }, "exercise nameKey collides after I/İ folding; left as is");
    }
  }
  if (n > 0) log.info({ n }, "exercises re-keyed");
  return n;
}

export async function migrateTraining(log: Pick<FastifyBaseLogger, "info" | "warn">): Promise<void> {
  try {
    await ensureUniqueWorkoutDay(log);
    await rekeyExercises(log);
  } catch (e) {
    // Never keep the API from booting over a migration; the routes stay correct without it.
    log.warn({ err: e }, "training migration skipped");
  }
}
