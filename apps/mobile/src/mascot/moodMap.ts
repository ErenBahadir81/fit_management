import type { FlooMood as LegacyMood } from "./moods";
import { MOODS, type Mood as FlooMood } from "./model/params";

/**
 * Two mood vocabularies meet here.
 *
 * - The API (`@fitfloow/core`'s `Mood`, e.g. the home and report mascot lines, goal feedback) and
 *   the v1 SVG mascot speak ten moods: `happy cheer think sleepy flex worried proud sad hype curious`.
 * - Floo 3 (`model/`) draws nine: `idle happy celebrate sad worried sleepy think proud energetic`.
 *   This is the vocabulary of the voice queue and the corner Floo.
 *
 * A name both share means the same face. The four API-only moods land on the nearest model pose
 * (a cheer or a hype is a celebration, a flex is energy, curiosity is thinking), never on a
 * neutral face, so what the server meant still shows.
 */
const API_TO_MODEL: Record<LegacyMood, FlooMood> = {
  happy: "happy",
  cheer: "celebrate",
  hype: "celebrate",
  proud: "proud",
  flex: "energetic",
  think: "think",
  curious: "think",
  sleepy: "sleepy",
  worried: "worried",
  sad: "sad",
};

/** The other way, for the SVG fallback when CanvasKit never loaded on web. */
const MODEL_TO_LEGACY: Record<FlooMood, LegacyMood> = {
  idle: "happy",
  happy: "happy",
  celebrate: "cheer",
  sad: "sad",
  worried: "worried",
  sleepy: "sleepy",
  think: "think",
  proud: "proud",
  energetic: "flex",
};

const MODEL_MOODS: ReadonlySet<string> = new Set(MOODS);

/** Any mood (API or model vocabulary) → the model face to draw. Unknown values fall back to `idle`. */
export function toFlooMood(mood: LegacyMood | FlooMood): FlooMood {
  if (MODEL_MOODS.has(mood)) return mood as FlooMood;
  return API_TO_MODEL[mood as LegacyMood] ?? "idle";
}

/** A model mood → the nearest face of the v1 SVG mascot. Unknown values fall back to `happy`. */
export function toLegacyMood(mood: FlooMood): LegacyMood {
  return MODEL_TO_LEGACY[mood] ?? "happy";
}
