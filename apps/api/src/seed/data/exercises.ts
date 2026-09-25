import type { ExerciseInput } from "@fitfloow/core";
import { EXERCISE_ACTIVATION_V1 } from "./exerciseActivation.v1";

/** A seed catalog row: an exercise plus the stable slug that links it to its activation evidence. */
export interface SeedExercise extends ExerciseInput {
  slug: string;
}

/**
 * The exercise catalog, derived from the activation data v1 (143 exercises, 17 muscle keys; the
 * 20 v1 names are among them). `load` = how much of one set counts toward that muscle's weekly
 * volume. Confidence and sources stay in `exerciseActivation.v1.ts`; the admin panel reads them
 * from there by slug. Existing databases get this catalog through `syncExerciseCatalogV1`.
 */
export const SEED_EXERCISES: SeedExercise[] = EXERCISE_ACTIVATION_V1.map((row) => ({
  slug: row.slug,
  name: row.name,
  muscles: row.muscles.map((m) => ({ key: m.key, load: m.load })),
  defaultSets: row.defaultSets,
  defaultReps: row.defaultReps,
  metric: row.metric,
  kind: row.kind,
  equipment: [...row.equipment],
  instructions: row.instructions,
}));
