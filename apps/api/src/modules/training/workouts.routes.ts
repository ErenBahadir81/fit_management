import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { dayOfLog, undoTransition, zDateKey, zUpdateWorkoutInput, type DayDTO, type LastPerformance, type WorkoutLogDTO } from "@fitfloow/core";
import { Program } from "../../models/program";
import { AppError } from "../../lib/errors";
import { WorkoutLog, toSetEntryDTO, toWorkoutLogDTO, type WorkoutLogDoc } from "../../models/workoutLog";
import { escapeRegex } from "../platform/users.service";
import {
  buildCardio,
  buildStrengthEntries,
  catalogFor,
  invalidateWeeks,
  measurementDayOf,
  objectIdOrNotFound,
  setPointer,
  upgradeProgramDoc,
  workoutFilter,
} from "./service";

const zListQuery = z.object({
  from: zDateKey.optional(),
  to: zDateKey.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().optional(),
});
const zIdParams = z.object({ id: z.string().min(1) });
const zExerciseNameParams = z.object({ name: z.string().trim().min(1).max(80) });

export async function workoutRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  /**
   * C1 — "last time you did this". The most recent session in which the caller actually logged
   * this exercise (skipped or empty entries do not count). An exercise never logged is an empty
   * answer, not a 404: "no history" is information, not an error.
   */
  app.get("/training/exercises/:name/last", { ...auth, schema: { params: zExerciseNameParams } }, async (req): Promise<LastPerformance> => {
    const { name } = req.params as z.infer<typeof zExerciseNameParams>;
    const nameRx = new RegExp(`^${escapeRegex(name)}$`, "i");
    const doc = await WorkoutLog.findOne({
      userId: req.auth.id,
      isOffDay: false,
      strength: { $elemMatch: { name: nameRx, skipped: { $ne: true }, "sets.0": { $exists: true } } },
    })
      .sort({ date: -1, _id: -1 })
      .select({ dateKey: 1, strength: 1 })
      .lean<Pick<WorkoutLogDoc, "dateKey" | "strength"> | null>();

    const entry = doc?.strength?.find((e) => nameRx.test(e.name ?? "") && !e.skipped && (e.sets?.length ?? 0) > 0);
    if (!doc || !entry) return { dateKey: null, sets: [] };
    return { dateKey: doc.dateKey, sets: entry.sets.map(toSetEntryDTO) };
  });

  /** History, newest first. `before` is the id of the last row of the previous page. */
  app.get("/workouts", { ...auth, schema: { querystring: zListQuery } }, async (req) => {
    const q = req.query as z.infer<typeof zListQuery>;
    const docs = await WorkoutLog.find(workoutFilter(req.auth.id, q))
      .sort({ date: -1, _id: -1 })
      .limit(q.limit)
      .lean<WorkoutLogDoc[]>();
    return { logs: docs.map(toWorkoutLogDTO) };
  });

  app.get("/workouts/:id", { ...auth, schema: { params: zIdParams } }, async (req) => {
    const { id } = req.params as z.infer<typeof zIdParams>;
    const doc = await WorkoutLog.findOne({ _id: objectIdOrNotFound(id, "Antrenman"), userId: req.auth.id }).lean<WorkoutLogDoc | null>();
    if (!doc) throw AppError.notFound("Antrenman");
    return { log: toWorkoutLogDTO(doc) };
  });

  /** Fix a session after the fact. Never touches the pointer, the week or cardio targets. */
  app.patch("/workouts/:id", { ...auth, schema: { params: zIdParams, body: zUpdateWorkoutInput } }, async (req) => {
    const { id } = req.params as z.infer<typeof zIdParams>;
    const input = req.body as z.infer<typeof zUpdateWorkoutInput>;
    const log = await WorkoutLog.findOne({ _id: objectIdOrNotFound(id, "Antrenman"), userId: req.auth.id });
    if (!log) throw AppError.notFound("Antrenman");
    if (log.isOffDay) throw AppError.validation("Dinlenme günü düzenlenemez");

    if (input.strength !== undefined) {
      // B6: planned targets survive the edit — from the entries being replaced, then the day.
      const program = await Program.findOne({ userId: req.auth.id }).select({ days: 1 }).lean();
      const day = program ? dayOfLog((program.days ?? []) as DayDTO[], toWorkoutLogDTO(log)) : null;
      const catalog = await catalogFor(input.strength.map((e) => e.name));
      log.strength = buildStrengthEntries(input.strength, day, catalog, toWorkoutLogDTO(log).strength);
      log.markModified("strength");
    }
    if (input.run !== undefined) log.run = buildCardio(input.run, log.run);
    if (input.swim !== undefined) log.swim = buildCardio(input.swim, log.swim);
    if (input.durationMin !== undefined) log.durationMin = input.durationMin;
    if (input.notes !== undefined) log.notes = input.notes;
    if (input.rpe !== undefined) log.rpe = input.rpe;
    await log.save();

    await invalidateWeeks(req.auth.id, [log.dateKey], await measurementDayOf(req.auth.id));
    const dto: WorkoutLogDTO = toWorkoutLogDTO(log);
    return { log: dto };
  });

  app.delete("/workouts/:id", { ...auth, schema: { params: zIdParams } }, async (req, reply) => {
    const { id } = req.params as z.infer<typeof zIdParams>;
    const log = await WorkoutLog.findOneAndDelete({ _id: objectIdOrNotFound(id, "Antrenman"), userId: req.auth.id });
    if (!log) throw AppError.notFound("Antrenman");
    // B4: if this log still owns the pointer (nothing moved it since), put the pointer back.
    const program = await Program.findOne({ userId: req.auth.id });
    if (program) {
      upgradeProgramDoc(program);
      setPointer(program, undoTransition(program, log));
      await program.save();
    }
    await invalidateWeeks(req.auth.id, [log.dateKey], await measurementDayOf(req.auth.id));
    return reply.status(204).send();
  });
}
