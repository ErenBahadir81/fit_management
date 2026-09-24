import type { ExerciseActivationReference } from "@fitfloow/core";
import { ACTIVATION_SOURCES, EXERCISE_ACTIVATION_V1, type ExerciseActivation } from "../../seed/data/exerciseActivation.v1";

const VERSION = "v1";

let bySlug: Map<string, ExerciseActivation> | null = null;

/**
 * The literature values an exercise was seeded with (activation data v1), for the admin panel to
 * show read-only next to the editable loads. Found only by the catalog slug the seed stored, so a
 * renamed exercise keeps its reference and an admin-made one — even one that reuses a catalog
 * name — is never presented as literature-backed. Null without a slug.
 */
export function activationReferenceFor(exercise: { slug?: string | null }): ExerciseActivationReference | null {
  if (!exercise.slug) return null;
  bySlug ??= new Map(EXERCISE_ACTIVATION_V1.map((row) => [row.slug, row]));
  const row = bySlug.get(exercise.slug);
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
