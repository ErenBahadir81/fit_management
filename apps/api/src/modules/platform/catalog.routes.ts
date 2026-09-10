import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Muscle, toMuscleDTO, type MuscleDoc } from "../../models/muscle";
import { Exercise, toExerciseDTO, type ExerciseDoc } from "../../models/exercise";
import { escapeRegex } from "./users.service";

/** Read-only catalog for logged-in users (mobile). Admin CRUD lives under /admin/*. */
export async function catalogRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };

  app.get("/muscles", auth, async () => {
    const docs = await Muscle.find({ active: true }).sort({ order: 1 }).lean<MuscleDoc[]>();
    return { muscles: docs.map(toMuscleDTO) };
  });

  app.get("/exercises", { ...auth, schema: { querystring: z.object({ q: z.string().optional() }) } }, async (req) => {
    const { q } = req.query as { q?: string };
    const filter: Record<string, unknown> = { active: true };
    if (q && q.trim()) filter.name = new RegExp(escapeRegex(q.trim()), "i");
    const docs = await Exercise.find(filter).sort({ name: 1 }).lean<ExerciseDoc[]>();
    return { exercises: docs.map(toExerciseDTO) };
  });
}
