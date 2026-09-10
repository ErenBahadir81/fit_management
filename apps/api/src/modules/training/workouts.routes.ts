import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zDateKey, zUpdateWorkoutInput, type WorkoutLogDTO } from "@fitfloow/core";
import { AppError } from "../../lib/errors";
import { WorkoutLog, toWorkoutLogDTO, type WorkoutLogDoc } from "../../models/workoutLog";
import { buildCardio, buildStrengthEntries, catalogFor, invalidateWeeks, measurementDayOf, objectIdOrNotFound, workoutFilter } from "./service";

const zListQuery = z.object({
  from: zDateKey.optional(),
  to: zDateKey.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().optional(),
});
const zIdParams = z.object({ id: z.string().min(1) });

export async function workoutRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

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
      const catalog = await catalogFor(input.strength.map((e) => e.name));
      log.strength = buildStrengthEntries(input.strength, null, catalog);
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
    await invalidateWeeks(req.auth.id, [log.dateKey], await measurementDayOf(req.auth.id));
    return reply.status(204).send();
  });
}
