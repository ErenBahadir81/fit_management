/**
 * Rest durations and their clamping.
 *
 * This is a leaf on purpose. `restEngine` needs the persisted preset and `restPrefs` needs to clamp
 * what it persists, which made the two import each other — a require cycle that Metro warns about
 * and that leaves one of the two modules holding `undefined` for the other's exports at init time.
 * Both now depend on this instead, and neither depends on the other.
 */
import { clamp } from "@fitfloow/core";

/** Durations the preset row offers. Long enough for a heavy triple, short enough for a superset. */
export const REST_PRESETS = [30, 45, 60, 90, 120, 180] as const;
/** One tap of −/+ on a running rest. */
export const REST_STEP_SECONDS = 15;
export const MIN_PRESET_SECONDS = 5;
export const MAX_PRESET_SECONDS = 600;

/** Keep a stored or typed preset inside the range the UI can express. */
export function clampPresetSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_PRESET_SECONDS;
  return clamp(Math.trunc(seconds), MIN_PRESET_SECONDS, MAX_PRESET_SECONDS);
}
