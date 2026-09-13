/**
 * What the app remembers about resting: how long the user rests on each exercise, and whether the
 * rest cue makes a sound. One MMKV blob, read and written synchronously — a preset tapped mid-set
 * has to be there on the next set, not one render later.
 */
import { STORAGE_KEYS, getJSON, removeKey, setJSON } from "../../../lib/storage";
import { clampPresetSeconds } from "./restDurations";

export const REST_PREFS_KEY = STORAGE_KEYS.restPrefs;

interface RestPrefs {
  /** Normalised exercise name → seconds. */
  presets: Record<string, number>;
  muted: boolean;
}

const EMPTY: RestPrefs = { presets: {}, muted: false };

/** "  Bench Press " and "bench press" are the same exercise. Turkish casing, Turkish rules. */
function normalizeKey(exerciseKey: string): string {
  return exerciseKey.trim().toLocaleLowerCase("tr-TR");
}

function read(): RestPrefs {
  const raw = getJSON<Partial<RestPrefs>>(REST_PREFS_KEY);
  if (!raw || typeof raw !== "object") return EMPTY;
  const presets = raw.presets && typeof raw.presets === "object" ? raw.presets : {};
  return { presets, muted: raw.muted === true };
}

function write(next: RestPrefs): void {
  setJSON(REST_PREFS_KEY, next);
}

/** Seconds this user rests on this exercise, or `null` when there is no memory yet. */
export function readRestPreset(exerciseKey: string): number | null {
  const key = normalizeKey(exerciseKey);
  if (!key) return null;
  const stored = read().presets[key];
  return typeof stored === "number" && Number.isFinite(stored) ? clampPresetSeconds(stored) : null;
}

export function writeRestPreset(exerciseKey: string, seconds: number): void {
  const key = normalizeKey(exerciseKey);
  if (!key) return;
  const prefs = read();
  write({ ...prefs, presets: { ...prefs.presets, [key]: clampPresetSeconds(seconds) } });
}

export function isRestSoundMuted(): boolean {
  return read().muted;
}

export function setRestSoundMuted(muted: boolean): void {
  write({ ...read(), muted });
}

export function clearRestPrefs(): void {
  removeKey(REST_PREFS_KEY);
}
