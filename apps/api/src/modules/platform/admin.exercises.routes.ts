import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zExerciseInput, zExerciseUpdate, zId, type MuscleLoad } from "@fitfloow/core";
import { Exercise, toExerciseDTO, type ExerciseDoc } from "../../models/exercise";
import { Muscle } from "../../models/muscle";
import { AppError } from "../../lib/errors";
import { escapeRegex, isDuplicateKeyError, toObjectId } from "./users.service";

const zIdParams = z.object({ id: zId });

/** Case-insensitive uniqueness key for exercise names (stored as `nameKey`). */
export function exerciseNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Every referenced muscle key must exist in the catalog (active or not). */
export async function assertMuscleKeys(muscles: MuscleLoad[] | undefined): Promise<void> {
  if (!muscles || muscles.length === 0) return;
  const keys = [...new Set(muscles.map((m) => m.key))];
  const found = await Muscle.find({ key: { $in: keys } }).select({ key: 1 }).lean();
  const known = new Set(found.map((m) => m.key));
  const unknown = keys.filter((k) => !known.has(k));
  if (unknown.length > 0) throw AppError.validation("Bilinmeyen kas anahtarı", unknown);
}

export async function adminExercisesRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.requireAdmin] };

  app.get(
    "/admin/exercises",
    { ...admin, schema: { querystring: z.object({ q: z.string().optional(), muscle: z.string().optional() }) } },
    async (req) => {
      const { q, muscle } = req.query as { q?: string; muscle?: string };
      const filter: Record<string, unknown> = {};
      if (q && q.trim()) filter.name = new RegExp(escapeRegex(q.trim()), "i");
      if (muscle && muscle.trim()) filter["muscles.key"] = muscle.trim();
      const docs = await Exercise.find(filter).sort({ name: 1 }).lean<ExerciseDoc[]>();
      return { exercises: docs.map(toExerciseDTO) };
    }
  );

  app.post("/admin/exercises", { ...admin, schema: { body: zExerciseInput } }, async (req, reply) => {
    const input = req.body as z.infer<typeof zExerciseInput>;
    await assertMuscleKeys(input.muscles);
    const nameKey = exerciseNameKey(input.name);
    if (await Exercise.exists({ nameKey })) throw AppError.conflict("Bu isimde bir egzersiz zaten var");
    const created = await Exercise.create({ ...input, name: input.name.trim(), nameKey }).catch((e: unknown) => {
      if (isDuplicateKeyError(e)) throw AppError.conflict("Bu isimde bir egzersiz zaten var");
      throw e;
    });
    reply.status(201);
    return { exercise: toExerciseDTO(created.toObject() as ExerciseDoc) };
  });

  app.get("/admin/exercises/:id", { ...admin, schema: { params: zIdParams } }, async (req) => {
    const oid = toObjectId((req.params as { id: string }).id);
    const doc = oid ? await Exercise.findById(oid).lean<ExerciseDoc>() : null;
    if (!doc) throw AppError.notFound("Egzersiz");
    return { exercise: toExerciseDTO(doc) };
  });

  app.patch("/admin/exercises/:id", { ...admin, schema: { params: zIdParams, body: zExerciseUpdate } }, async (req) => {
    const oid = toObjectId((req.params as { id: string }).id);
    const existing = oid ? await Exercise.findById(oid).lean<ExerciseDoc>() : null;
    if (!existing) throw AppError.notFound("Egzersiz");
    const input = req.body as z.infer<typeof zExerciseUpdate>;
    if (input.muscles) await assertMuscleKeys(input.muscles);
    const set: Record<string, unknown> = { ...input };
    if (input.name) {
      const nameKey = exerciseNameKey(input.name);
      if (nameKey !== existing.nameKey && (await Exercise.exists({ nameKey, _id: { $ne: existing._id } })))
        throw AppError.conflict("Bu isimde bir egzersiz zaten var");
      set.name = input.name.trim();
      set.nameKey = nameKey;
    }
    const doc = await Exercise.findByIdAndUpdate(existing._id, { $set: set }, { returnDocument: "after" }).lean<ExerciseDoc>();
    if (!doc) throw AppError.notFound("Egzersiz");
    return { exercise: toExerciseDTO(doc) };
  });

  app.delete("/admin/exercises/:id", { ...admin, schema: { params: zIdParams } }, async (req, reply) => {
    const oid = toObjectId((req.params as { id: string }).id);
    const res = oid ? await Exercise.deleteOne({ _id: oid }) : { deletedCount: 0 };
    if (!res.deletedCount) throw AppError.notFound("Egzersiz");
    return reply.status(204).send();
  });
}
