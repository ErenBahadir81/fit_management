import { exerciseNameKey, type ExerciseActivationReference } from "@fitfloow/core";
import { ACTIVATION_SOURCES, EXERCISE_ACTIVATION_V1, type ExerciseActivation } from "../../seed/data/exerciseActivation.v1";

const VERSION = "v1";

let index: { bySlug: Map<string, ExerciseActivation>; byName: Map<string, ExerciseActivation> } | null = null;

function lookup() {
  index ??= {
    bySlug: new Map(EXERCISE_ACTIVATION_V1.map((row) => [row.slug, row])),
    byName: new Map(EXERCISE_ACTIVATION_V1.map((row) => [exerciseNameKey(row.name), row])),
  };
  return index;
}

/**
 * The literature values an exercise was seeded with (activation data v1), for the admin panel to
 * show read-only next to the editable loads. Found by the catalog slug the seed stored — so a
 * renamed exercise keeps its reference — or, for rows without one, by name. Null when neither
 * matches (an exercise an admin made up).
 */
export function activationReferenceFor(exercise: { slug?: string | null; name: string }): ExerciseActivationReference | null {
  const { bySlug, byName } = lookup();
  const row = (exercise.slug ? bySlug.get(exercise.slug) : undefined) ?? byName.get(exerciseNameKey(exercise.name));
  if (!row) return null;
  const cited = [...new Set(row.muscles.flatMap((m) => m.sources))];
  return {
    version: VERSION,
    slug: row.slug,
    name: row.name,
    muscles: row.muscles.map((m) => ({ key: m.key, load: m.load, confidence: { ...m.confidence }, sources: [...m.sources] })),
    sources: cited
      .filter((id) => ACTIVATION_SOURCES[id])
      .map((id) => {
        const s = ACTIVATION_SOURCES[id];
        return { id, title: s.title, url: s.url, kind: s.kind, ...(s.year ? { year: s.year } : {}) };
      }),
  };
}
