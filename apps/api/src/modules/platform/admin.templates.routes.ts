import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  templateVolume,
  zDayInput,
  zId,
  zProgramTemplateInput,
  type DayDTO,
  type ProgramTemplateDTO,
} from "@fitfloow/core";
import { ProgramTemplate, toProgramTemplateDTO, type ProgramTemplateDoc } from "../../models/program";
import { AppError } from "../../lib/errors";
import { toObjectId } from "./users.service";

const zIdParams = z.object({ id: zId });
/** Written out instead of `zProgramTemplateInput.partial()` so field defaults never turn an
 * absent key into an accidental overwrite ("" / []). */
const zTemplateUpdate = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().max(500).optional(),
  days: z.array(zDayInput).min(1).max(14).optional(),
  tags: z.array(z.string()).optional(),
});
type DayInput = z.infer<typeof zProgramTemplateInput>["days"][number];

/** Fill the optional exercise fields and renumber days 1..N in the submitted order. */
export function normalizeDays(days: DayInput[]): DayDTO[] {
  return days.map((day, i) => ({
    order: i + 1,
    title: day.title,
    focus: day.focus ?? "",
    kind: day.kind,
    exercises: (day.exercises ?? []).map((ex) => ({
      name: ex.name,
      muscles: ex.muscles ?? [],
      targetSets: ex.targetSets,
      targetReps: ex.targetReps,
      targetRIR: ex.targetRIR ?? null,
      metric: ex.metric ?? "reps",
    })),
    run: day.run ?? null,
    swim: day.swim ?? null,
  }));
}

export function toTemplateDTO(doc: ProgramTemplateDoc): ProgramTemplateDTO {
  // B2 owns the training volume engine; `templateVolume` excludes mobility work like the recovery module.
  return toProgramTemplateDTO(doc, templateVolume(doc.days ?? []));
}

async function findOr404(id: string): Promise<ProgramTemplateDoc> {
  const oid = toObjectId(id);
  const doc = oid ? await ProgramTemplate.findById(oid).lean<ProgramTemplateDoc>() : null;
  if (!doc) throw AppError.notFound("Program şablonu");
  return doc;
}

export async function adminTemplatesRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.requireAdmin] };

  app.get("/admin/program-templates", admin, async () => {
    const docs = await ProgramTemplate.find().sort({ createdAt: 1 }).lean<ProgramTemplateDoc[]>();
    return { templates: docs.map(toTemplateDTO) };
  });

  app.post("/admin/program-templates", { ...admin, schema: { body: zProgramTemplateInput } }, async (req, reply) => {
    const input = req.body as z.infer<typeof zProgramTemplateInput>;
    const created = await ProgramTemplate.create({ ...input, days: normalizeDays(input.days) });
    reply.status(201);
    return { template: toTemplateDTO(created.toObject() as ProgramTemplateDoc) };
  });

  app.get("/admin/program-templates/:id", { ...admin, schema: { params: zIdParams } }, async (req) => {
    return { template: toTemplateDTO(await findOr404((req.params as { id: string }).id)) };
  });

  app.patch("/admin/program-templates/:id", { ...admin, schema: { params: zIdParams, body: zTemplateUpdate } }, async (req) => {
    const existing = await findOr404((req.params as { id: string }).id);
    const input = req.body as z.infer<typeof zTemplateUpdate>;
    const set: Record<string, unknown> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.description !== undefined) set.description = input.description;
    if (input.tags !== undefined) set.tags = input.tags;
    if (input.days !== undefined) set.days = normalizeDays(input.days);
    const doc = await ProgramTemplate.findByIdAndUpdate(existing._id, { $set: set }, { returnDocument: "after" }).lean<ProgramTemplateDoc>();
    if (!doc) throw AppError.notFound("Program şablonu");
    return { template: toTemplateDTO(doc) };
  });

  app.post("/admin/program-templates/:id/duplicate", { ...admin, schema: { params: zIdParams } }, async (req, reply) => {
    const source = await findOr404((req.params as { id: string }).id);
    const copy = await ProgramTemplate.create({
      name: `${source.name} (kopya)`,
      description: source.description ?? "",
      days: source.days ?? [],
      tags: source.tags ?? [],
    });
    reply.status(201);
    return { template: toTemplateDTO(copy.toObject() as ProgramTemplateDoc) };
  });

  app.delete("/admin/program-templates/:id", { ...admin, schema: { params: zIdParams } }, async (req, reply) => {
    const oid = toObjectId((req.params as { id: string }).id);
    const res = oid ? await ProgramTemplate.deleteOne({ _id: oid }) : { deletedCount: 0 };
    if (!res.deletedCount) throw AppError.notFound("Program şablonu");
    return reply.status(204).send();
  });
}
