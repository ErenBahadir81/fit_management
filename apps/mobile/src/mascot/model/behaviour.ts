/**
 * Floo 3 — what the character does, as opposed to how it is drawn: which gesture and mood each
 * trigger plays, how big a box it needs at each level of detail, and the mood the time of day
 * and the training plan put it in. Plain data and pure functions; no React.
 */
import type { EffectKind } from "./Effects";
import type { Mood, Trigger } from "./params";
import { gestureDuration, type Gesture } from "./poses";

// ── level of detail ────────────────────────────────────────────────────────

/**
 * - `full` (≥ 96 px wide): everything — legs, boots, finger creases, rim light, shadow.
 * - `mid` (56–96 px): arms and hands, no legs; the drop sits on a short contact shadow.
 * - `badge` (< 56 px, the header corner): body, face and one hand, cropped square.
 */
export type FlooLod = "full" | "mid" | "badge";

/** The slice of the 200 × 290 body space each LOD shows. */
export const LOD_VIEW: Record<FlooLod, { x: number; y: number; w: number; h: number }> = {
  full: { x: 0, y: 0, w: 200, h: 290 },
  mid: { x: 0, y: 0, w: 200, h: 250 },
  badge: { x: 5, y: 45, w: 190, h: 190 },
};

export function resolveLod(width: number, lod?: FlooLod): FlooLod {
  if (lod) return lod;
  if (!(width >= 56)) return "badge";
  return width >= 96 ? "full" : "mid";
}

/** The box a Floo of `width` px needs. Use it to reserve layout space before the canvas mounts. */
export function flooBox(width: number, lod?: FlooLod): { width: number; height: number; lod: FlooLod } {
  const w = Number.isFinite(width) && width > 0 ? width : 96;
  const l = resolveLod(w, lod);
  const v = LOD_VIEW[l];
  return { width: w, height: (w * v.h) / v.w, lod: l };
}

/** Width : height of the full-body box, kept for existing callers. */
export const FLOO_BADGE_ASPECT = 1;

// ── triggers ───────────────────────────────────────────────────────────────

export interface TriggerPlan {
  /** The mood the face takes while the trigger plays (null: keep the current one). */
  mood: Mood | null;
  gesture: Gesture | null;
  /** Mirror the gesture (left hand instead of right). */
  mirror?: boolean;
  effect: EffectKind | null;
  /** How long the trigger owns the mood before it falls back, ms. */
  hold: number;
  /** A mood passed through on the way back (the "picks itself up" beat). */
  recover?: Mood;
  hydration?: number;
}

export const TRIGGER_PLAN: Record<Trigger, TriggerPlan> = {
  mealLogged: { mood: "happy", gesture: "bellyPat", effect: "hearts", hold: 1400 },
  goalHit: { mood: "celebrate", gesture: "cheer", effect: "confetti", hold: 1900 },
  streakUp: { mood: "celebrate", gesture: "fistPump", effect: "star", hold: 1600 },
  // Falls, sits in it for a beat, gets back up. Never stays punished. The mood lifts to
  // "worried" only once it is standing again (the get-up ends at ≈ 1.9 s).
  missedDay: { mood: "sad", gesture: "fallRecover", effect: null, hold: 1900, recover: "worried" },
  overTarget: { mood: "worried", gesture: "whoa", effect: null, hold: 1500 },
  waterLogged: { mood: "happy", gesture: "drink", effect: "droplets", hold: 1500, hydration: 0.15 },
  setCompleted: { mood: "energetic", gesture: "flex", effect: null, hold: 1300 },
  workoutDone: { mood: "proud", gesture: "flex", effect: "star", hold: 1900 },
  measurementLogged: { mood: "happy", gesture: "thumbsUp", effect: null, hold: 1500 },
  volumeWarning: { mood: "worried", gesture: "point", effect: null, hold: 1900 },
  goalAdjustProposal: { mood: "think", gesture: "point", effect: null, hold: 1900 },
  greet: { mood: "happy", gesture: "wave", effect: null, hold: 1400 },
  tap: { mood: null, gesture: "boop", effect: null, hold: 0 },
};

export const TRIGGER_GESTURE: Record<Trigger, { gesture: Gesture | null; mirror: boolean }> = Object.fromEntries(
  (Object.keys(TRIGGER_PLAN) as Trigger[]).map((t) => [t, { gesture: TRIGGER_PLAN[t].gesture, mirror: !!TRIGGER_PLAN[t].mirror }])
) as Record<Trigger, { gesture: Gesture | null; mirror: boolean }>;

/**
 * Everything a notification queue needs to line a speech bubble up with the animation: the mood
 * to show, the gesture that plays, the particle effect, and how long the whole beat lasts.
 */
export function flooTriggerPlan(trigger: Trigger): TriggerPlan & { durationMs: number } {
  const p = TRIGGER_PLAN[trigger];
  const g = p.gesture ? gestureDuration(p.gesture) : 0;
  return { ...p, durationMs: Math.max(p.hold, g) };
}

// ── context ────────────────────────────────────────────────────────────────

export interface AmbientContext {
  now?: Date;
  /** A training day in the user's programme (and the workout is not done yet). */
  isTrainingDay?: boolean;
  /** A planned rest day. */
  isRestDay?: boolean;
}

/**
 * The mood Floo rests in when nothing is happening. Late at night and very early it is sleepy;
 * on a training day it is up for it; a rest day is calm; otherwise it is just happy to see you.
 */
export function ambientMood({ now = new Date(), isTrainingDay = false, isRestDay = false }: AmbientContext = {}): Mood {
  const h = now.getHours();
  if (h >= 23 || h < 6) return "sleepy";
  if (isTrainingDay) return h < 21 ? "energetic" : "happy";
  if (isRestDay) return "idle";
  return h < 11 ? "happy" : "idle";
}
