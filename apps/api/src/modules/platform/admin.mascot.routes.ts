import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DEFAULT_MASCOT_MESSAGES, MASCOT_KEYS, zId, zMascotTemplateInput, zMascotTemplateUpdate } from "@fitfloow/core";
import { MascotMessage, toMascotTemplateDTO, type MascotMessageDoc } from "../../models/mascot";
import { AppError } from "../../lib/errors";
import { isDuplicateKeyError, toObjectId } from "./users.service";

const zIdParams = z.object({ id: zId });
const KEY_ORDER = new Map(MASCOT_KEYS.map((k, i) => [k as string, i]));
const zCreate = zMascotTemplateInput.extend({
  key: z.enum(MASCOT_KEYS),
  active: z.boolean().default(true),
});

/** Catalog order follows MASCOT_KEYS so the admin list always reads top-down like the docs. */
function sortByKey(docs: MascotMessageDoc[]): MascotMessageDoc[] {
  return [...docs].sort((a, b) => (KEY_ORDER.get(a.key) ?? 999) - (KEY_ORDER.get(b.key) ?? 999));
}

async function listAll() {
  const docs = await MascotMessage.find().lean<MascotMessageDoc[]>();
  return sortByKey(docs).map(toMascotTemplateDTO);
}

export async function adminMascotRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.requireAdmin] };

  app.get("/admin/mascot-messages", admin, async () => ({ messages: await listAll() }));

  app.post("/admin/mascot-messages", { ...admin, schema: { body: zCreate } }, async (req, reply) => {
    const input = req.body as z.infer<typeof zCreate>;
    if (await MascotMessage.exists({ key: input.key })) throw AppError.conflict("Bu anahtar için zaten bir mesaj var");
    const created = await MascotMessage.create(input).catch((e: unknown) => {
      if (isDuplicateKeyError(e)) throw AppError.conflict("Bu anahtar için zaten bir mesaj var");
      throw e;
    });
    reply.status(201);
    return { message: toMascotTemplateDTO(created.toObject() as MascotMessageDoc) };
  });

  app.post("/admin/mascot-messages/reset", admin, async () => {
    await MascotMessage.deleteMany({});
    await MascotMessage.insertMany(DEFAULT_MASCOT_MESSAGES.map((m) => ({ ...m, active: true })));
    return { messages: await listAll() };
  });

  app.patch("/admin/mascot-messages/:id", { ...admin, schema: { params: zIdParams, body: zMascotTemplateUpdate } }, async (req) => {
    const oid = toObjectId((req.params as { id: string }).id);
    // zMascotTemplateUpdate omits `key`: the catalog key is immutable, edit the variants instead.
    const update = req.body as z.infer<typeof zMascotTemplateUpdate>;
    const doc = oid
      ? await MascotMessage.findByIdAndUpdate(oid, { $set: update }, { returnDocument: "after" }).lean<MascotMessageDoc>()
      : null;
    if (!doc) throw AppError.notFound("Mesaj");
    return { message: toMascotTemplateDTO(doc) };
  });

  app.delete("/admin/mascot-messages/:id", { ...admin, schema: { params: zIdParams } }, async (req, reply) => {
    const oid = toObjectId((req.params as { id: string }).id);
    const res = oid ? await MascotMessage.deleteOne({ _id: oid }) : { deletedCount: 0 };
    if (!res.deletedCount) throw AppError.notFound("Mesaj");
    return reply.status(204).send();
  });
}
