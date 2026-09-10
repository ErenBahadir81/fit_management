import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { zMuscleInput, zMuscleKey, zMuscleUpdate } from "@fitfloow/core";
import { Muscle, toMuscleDTO, type MuscleDoc } from "../../models/muscle";
import { Exercise } from "../../models/exercise";
import { AppError } from "../../lib/errors";
import { isDuplicateKeyError } from "./users.service";

const zKeyParams = z.object({ key: zMuscleKey });
/** `active` gets a default so the admin panel can create a muscle without spelling it out. */
const zCreateMuscle = zMuscleInput.extend({ active: z.boolean().default(true) });

async function listAll(): Promise<MuscleDoc[]> {
  return Muscle.find().sort({ order: 1, key: 1 }).lean<MuscleDoc[]>();
}

export async function adminMusclesRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.requireAdmin] };

  app.get("/admin/muscles", admin, async () => ({ muscles: (await listAll()).map(toMuscleDTO) }));

  app.post("/admin/muscles", { ...admin, schema: { body: zCreateMuscle } }, async (req, reply) => {
    const input = req.body as z.infer<typeof zCreateMuscle>;
    if (await Muscle.exists({ key: input.key })) throw AppError.conflict("Bu kas anahtarı zaten var");
    const last = await Muscle.findOne().sort({ order: -1 }).select({ order: 1 }).lean();
    const order = input.order ?? (last ? last.order + 1 : 0);
    const created = await Muscle.create({ ...input, order }).catch((e: unknown) => {
      if (isDuplicateKeyError(e)) throw AppError.conflict("Bu kas anahtarı zaten var");
      throw e;
    });
    reply.status(201);
    return { muscle: toMuscleDTO(created.toObject() as MuscleDoc) };
  });

  // PUT before the :key routes for readability; Fastify matches static segments first anyway.
  app.put("/admin/muscles/order", { ...admin, schema: { body: z.object({ keys: z.array(zMuscleKey).min(1) }) } }, async (req) => {
    const { keys } = req.body as { keys: string[] };
    const existing = await Muscle.find().select({ key: 1 }).lean();
    const known = new Set(existing.map((m) => m.key));
    const unique = new Set(keys);
    if (unique.size !== keys.length) throw AppError.validation("Sıralamada tekrar eden anahtar var");
    const unknown = keys.filter((k) => !known.has(k));
    if (unknown.length > 0) throw AppError.validation("Bilinmeyen kas anahtarı", unknown);
    if (keys.length !== existing.length) throw AppError.validation("Sıralama tüm kasları içermeli", { expected: existing.length, got: keys.length });
    await Muscle.bulkWrite(keys.map((key, order) => ({ updateOne: { filter: { key }, update: { $set: { order } } } })));
    return { muscles: (await listAll()).map(toMuscleDTO) };
  });

  app.patch("/admin/muscles/:key", { ...admin, schema: { params: zKeyParams, body: zMuscleUpdate } }, async (req) => {
    const { key } = req.params as { key: string };
    // zMuscleUpdate omits `key`, so zod strips any attempt to rename a muscle.
    const update = req.body as z.infer<typeof zMuscleUpdate>;
    const muscle = await Muscle.findOneAndUpdate({ key }, { $set: update }, { returnDocument: "after" }).lean<MuscleDoc>();
    if (!muscle) throw AppError.notFound("Kas");
    return { muscle: toMuscleDTO(muscle) };
  });

  app.delete("/admin/muscles/:key", { ...admin, schema: { params: zKeyParams } }, async (req, reply) => {
    const { key } = req.params as { key: string };
    const muscle = await Muscle.findOne({ key }).lean<MuscleDoc>();
    if (!muscle) throw AppError.notFound("Kas");
    const referencing = await Exercise.countDocuments({ "muscles.key": key });
    if (referencing > 0)
      throw AppError.conflict(`Bu kas ${referencing} egzersizde kullanılıyor; silmek yerine pasif yapabilirsin`);
    await Muscle.deleteOne({ key });
    return reply.status(204).send();
  });
}
