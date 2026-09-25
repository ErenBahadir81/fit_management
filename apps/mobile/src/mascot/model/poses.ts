/**
 * Floo 3 — the pose and gesture library. Plain data over the channels in `rig.ts`.
 *
 * A mood owns a resting body pose (`MOOD_RIG`). A gesture is a short timeline of keys on top of
 * whatever the mood is; the channels a gesture does not name keep following the mood, and every
 * gesture starts and ends on the mood's own pose, so nothing ever snaps back. Timing is authored
 * for the springs: keys say where a limb is *going*, the per-joint springs in `rig.ts` decide how
 * it gets there (overshoot, the elbow trailing the shoulder, the hand trailing the elbow).
 *
 * Authoring rules, so the character never reads as a robot:
 *  - big moves get an anticipation key in the opposite direction first (60–140 ms);
 *  - repeated beats (a wave, a clap) are never evenly spaced or equal in size;
 *  - the two arms never hit the same key at the same time unless it is a clap.
 */
import { compileGesture, mirrorSpec, poseVector, type CompiledGesture, type GestureSpec, type PoseSpec } from "./rig";
import type { Mood } from "./params";

// ── moods ──────────────────────────────────────────────────────────────────

const both = (spec: Record<string, number>): PoseSpec => {
  const out: Record<string, number> = {};
  for (const k in spec) {
    out[`L_${k}`] = spec[k];
    out[`R_${k}`] = spec[k];
  }
  return out as PoseSpec;
};

export const MOOD_RIG_SPEC: Record<Mood, PoseSpec> = {
  idle: {},
  happy: { ...both({ sh: 30, el: -12, wr: -6, curl: 0, spread: 0.4 }) },
  // Arms open, hands down and out — the pose a cheer settles into. Not straight up: a mood is held for
  // seconds, and arms held overhead read as a gesture that forgot to finish.
  celebrate: { ...both({ sh: 38, el: 6, wr: 2, curl: 0, spread: 0.85 }) },
  sad: { ...both({ sh: 13, el: -6, wr: -4, curl: 0.35, spread: 0 }), L_fx: -1.5, R_fx: -1.5 },
  // Hands wrung together in front of the belly.
  worried: {
    ...both({ ik: 1, curl: 0.55, spread: 0, front: 1, wr: -35, thumb: -0.4 }),
    L_ikX: 84, L_ikY: 206, R_ikX: 116, R_ikY: 205,
    L_fx: -1, R_fx: -1,
  },
  sleepy: { ...both({ sh: 11, el: -4, wr: -2, curl: 0.5, spread: 0 }), L_fa: -4 },
  // Chin on the right fist, left forearm across the belly propping the elbow.
  think: {
    R_ik: 1, R_ikX: 122, R_ikY: 186, R_wr: -70, R_curl: 0.85, R_thumb: -0.5, R_front: 1,
    L_ik: 1, L_ikX: 104, L_ikY: 208, L_wr: -40, L_curl: 0.4, L_front: 1,
  },
  // Fists on hips, elbows out.
  proud: {
    ...both({ ik: 1, curl: 0.9, thumb: -0.6, wr: -75, front: 1 }),
    L_ikX: 50, L_ikY: 206, R_ikX: 150, R_ikY: 206,
    L_fx: 2.5, R_fx: 2.5,
  },
  // Fists up and ready.
  energetic: { ...both({ sh: 62, el: 92, wr: 4, curl: 1, thumb: -1, spread: 0 }), L_fx: 1.5, R_fx: 1.5 },
};

export const MOOD_RIG: Record<Mood, number[]> = Object.fromEntries(
  (Object.keys(MOOD_RIG_SPEC) as Mood[]).map((m) => [m, poseVector(MOOD_RIG_SPEC[m])])
) as Record<Mood, number[]>;

// ── gestures ───────────────────────────────────────────────────────────────

export const GESTURES = [
  "wave",
  "clap",
  "fistPump",
  "cheer",
  "flex",
  "point",
  "shrug",
  "yawn",
  "thumbsUp",
  "think",
  "drink",
  "splash",
  "fallRecover",
  "bellyPat",
  "whoa",
  "boop",
  "wipeBrow",
  "walk",
  // Idle fidgets — played at partial weight, only when nothing else is going on.
  "scratchHead",
  "footTap",
  "lookAtHand",
  "crossArms",
  "stretch",
] as const;
export type Gesture = (typeof GESTURES)[number];

export const IDLE_GESTURES: readonly Gesture[] = ["scratchHead", "footTap", "lookAtHand", "crossArms", "stretch"];

/** Authored right-handed; `mirror` in the request flips them. */
const SPEC: Record<Gesture, GestureSpec> = {
  wave: {
    keys: [
      { t: 110, pose: { R_sh: 18, R_el: -14, lean: 1 }, ease: "out" },
      { t: 320, pose: { R_sh: 142, R_el: 26, R_wr: -4, R_curl: 0, R_spread: 0.9, lean: -2.5, lookX: 0.25 }, ease: "out" },
      { t: 450, pose: { R_el: -6, R_wr: 10 } },
      { t: 600, pose: { R_el: 30, R_wr: -10 } },
      { t: 730, pose: { R_el: 0, R_wr: 6 } },
      { t: 900, pose: { R_el: 24, R_wr: -6 } },
      { t: 1060, pose: { R_sh: 146, R_el: 12, R_wr: 0, lean: -1.5 } },
      // Down on an arc: the elbow folds in as the arm drops and the hand trails, instead of the
      // whole straight arm swinging down like a signal post.
      { t: 1270, pose: { R_sh: 84, R_el: -38, R_wr: 14, R_spread: 0.4, lean: 0, lookX: 0.1 } },
      { t: 1430, pose: { R_sh: 40, R_el: -26, R_wr: -2 }, ease: "out" },
      { t: 1620, pose: {} },
    ],
  },

  clap: {
    // Hands meet in front of the belly, well below the chin, with the elbows bent: the arms are
    // short (41.6 units), so a clap at the centre line with straight arms read as a flattened
    // plank, and the old hand height put the mittens over the mouth.
    keys: [
      { t: 150, pose: { L_ik: 1, R_ik: 1, L_front: 1, R_front: 1, L_ikX: 65, L_ikY: 197, R_ikX: 135, R_ikY: 197, L_wr: 8, R_wr: 8, L_spread: 0.1, R_spread: 0.1, L_curl: 0, R_curl: 0, lookY: 0.15 }, ease: "out" },
      { t: 260, pose: { L_ikX: 76.5, L_ikY: 201, R_ikX: 123.5, R_ikY: 201, L_wr: -18, R_wr: -18, squash: 0.03 }, ease: "in" },
      { t: 380, pose: { L_ikX: 66, L_ikY: 197.5, R_ikX: 134, R_ikY: 197, L_wr: 6, R_wr: 6, squash: 0 }, ease: "out" },
      { t: 480, pose: { L_ikX: 77, L_ikY: 201.5, R_ikX: 123, R_ikY: 201.5, L_wr: -18, R_wr: -18, squash: 0.03 }, ease: "in" },
      { t: 620, pose: { L_ikX: 65.5, L_ikY: 197, R_ikX: 134.5, R_ikY: 197.5, L_wr: 8, R_wr: 8, squash: 0 }, ease: "out" },
      { t: 740, pose: { L_ikX: 77.5, L_ikY: 202, R_ikX: 122.5, R_ikY: 202, L_wr: -20, R_wr: -20, squash: 0.035 }, ease: "in" },
      { t: 960, pose: { L_ikX: 73, L_ikY: 200, R_ikX: 127, R_ikY: 200, L_wr: -10, R_wr: -10, squash: 0, lookY: 0 } },
      { t: 1250, pose: { L_ik: 0, R_ik: 0, L_front: 0, R_front: 0 } },
    ],
  },

  fistPump: {
    keys: [
      { t: 120, pose: { R_sh: 16, R_el: 30, R_curl: 1, R_thumb: -1, squash: 0.06, hop: -1.5 }, ease: "out" },
      { t: 270, pose: { R_sh: 168, R_el: 4, R_wr: 0, squash: -0.04, hop: 5, L_sh: 36, L_el: -20 }, ease: "out" },
      { t: 430, pose: { R_sh: 132, R_el: 48, hop: 0, squash: 0.02 } },
      { t: 590, pose: { R_sh: 170, R_el: 2, hop: 3, squash: -0.03 }, ease: "out" },
      { t: 900, pose: { R_sh: 160, R_el: 10, hop: 0, squash: 0 } },
      { t: 1200, pose: {} },
    ],
  },
  cheer: {
    keys: [
      { t: 130, pose: { L_sh: 12, R_sh: 14, L_el: 30, R_el: 30, L_curl: 1, R_curl: 1, L_thumb: -1, R_thumb: -1, squash: 0.05 }, ease: "out" },
      { t: 360, pose: { L_sh: 150, R_sh: 158, L_el: 16, R_el: 10, L_wr: 0, R_wr: 0, squash: -0.04 }, ease: "out" },
      { t: 520, pose: { L_sh: 136, R_sh: 146, L_el: 36, R_el: 26, squash: 0 } },
      { t: 680, pose: { L_sh: 156, R_sh: 152, L_el: 12, R_el: 18, squash: -0.03 }, ease: "out" },
      { t: 1000, pose: { L_sh: 144, R_sh: 148, L_el: 22, R_el: 18 } },
      // Arms come down bent, not as two straight poles, and land on the mood's own pose.
      { t: 1260, pose: { L_sh: 64, R_sh: 60, L_el: 26, R_el: 22, L_curl: 0.5, R_curl: 0.5, L_thumb: 0, R_thumb: 0, squash: 0 } },
      { t: 1500, pose: {} },
    ],
  },

  flex: {
    // Upper arms out level, forearms up, fists beside the head — outside the silhouette, where the
    // biceps can be seen (a deeper elbow tucked the fists behind the head).
    keys: [
      { t: 150, pose: { L_sh: 50, R_sh: 54, L_el: 20, R_el: 24, L_curl: 1, R_curl: 1, L_thumb: -1, R_thumb: -1, squash: 0.05 }, ease: "out" },
      { t: 400, pose: { L_sh: 88, R_sh: 92, L_el: 78, R_el: 82, L_wr: 8, R_wr: 8, squash: -0.05, L_fx: 3, R_fx: 3 }, ease: "out" },
      { t: 580, pose: { L_el: 90, R_el: 74, squash: -0.03 } },
      { t: 760, pose: { L_el: 76, R_el: 92, squash: -0.05 } },
      { t: 1100, pose: { L_el: 82, R_el: 84, squash: -0.02 } },
      { t: 1300, pose: { L_sh: 48, R_sh: 50, L_el: 22, R_el: 20, L_curl: 0.6, R_curl: 0.6, L_thumb: 0, R_thumb: 0, squash: 0, L_fx: 0, R_fx: 0 } },
      { t: 1520, pose: {} },
    ],
  },

  point: {
    keys: [
      { t: 120, pose: { R_sh: 20, R_el: -10, R_curl: 0.6 }, ease: "out" },
      { t: 340, pose: { R_ik: 1, R_ikX: 188, R_ikY: 118, R_point: 1, R_curl: 1, R_thumb: -0.6, R_wr: 0, lookX: 0.55, lookY: -0.35, lean: -2 }, ease: "out" },
      { t: 1500, pose: { R_ik: 1, lookX: 0.4, lookY: -0.2 } },
      { t: 1850, pose: {} },
    ],
  },
  shrug: {
    keys: [
      { t: 90, pose: { squash: 0.04 }, ease: "out" },
      { t: 280, pose: { ...both({ sh: 36, el: 62, wr: -24, spread: 0.85, curl: 0, thumb: 0.3 }), squash: -0.02, hop: 1.5, mouth: -2 }, ease: "out" },
      { t: 820, pose: { hop: 0.5 } },
      { t: 1100, pose: {} },
    ],
  },
  yawn: {
    keys: [
      { t: 260, pose: { ...both({ sh: 120, el: 30, curl: 0.4 }), squash: -0.05, mouth: 6, eye: 0.55, lean: -1 }, ease: "inOut" },
      { t: 820, pose: { ...both({ sh: 156, el: 16, curl: 0.2 }), squash: -0.08, mouth: 11, eye: 0.9, lean: 1 }, ease: "inOut" },
      { t: 1250, pose: { L_sh: 150, R_sh: 158, mouth: 9, eye: 0.85 } },
      { t: 1750, pose: { squash: 0.03, mouth: 0, eye: 0.3 } },
      { t: 2050, pose: {} },
    ],
  },
  thumbsUp: {
    keys: [
      { t: 110, pose: { R_sh: 22, R_el: 10, R_curl: 0.7 }, ease: "out" },
      { t: 320, pose: { R_sh: 52, R_el: 96, R_wr: 0, R_curl: 1, R_thumb: 1, lean: -2, lookX: 0.2 }, ease: "out" },
      { t: 470, pose: { R_el: 104, R_sh: 56 } },
      { t: 1250, pose: { R_el: 98 } },
      { t: 1550, pose: {} },
    ],
  },
  think: {
    keys: [
      { t: 320, pose: { R_ik: 1, R_ikX: 122, R_ikY: 186, R_wr: -70, R_curl: 0.85, R_thumb: -0.5, R_front: 1, lookX: 0.45, lookY: -0.55, lean: 3 }, ease: "inOut" },
      { t: 900, pose: { R_ikY: 184.5 } },
      { t: 1500, pose: { R_ikY: 186, lookX: 0.35 } },
      { t: 1850, pose: {} },
    ],
  },
  drink: {
    keys: [
      { t: 280, pose: { R_ik: 1, R_ikX: 131, R_ikY: 170, R_wr: -110, R_curl: 0.75, R_thumb: -0.3, R_front: 1, L_ik: 1, L_ikX: 50, L_ikY: 206, L_wr: -75, L_curl: 0.9, L_front: 1 }, ease: "inOut" },
      { t: 480, pose: { lean: -7, R_ikX: 127, R_ikY: 160, lookY: -0.5, eye: 0.4 }, ease: "inOut" },
      { t: 900, pose: { lean: -8, R_ikY: 158, eye: 0.5 } },
      { t: 1100, pose: { lean: 1, R_ikY: 170, lookY: 0, eye: 0, squash: 0.03 }, ease: "out" },
      { t: 1450, pose: {} },
    ],
  },
  splash: {
    keys: [
      { t: 110, pose: { ...both({ sh: 18, el: -22, curl: 0.3 }), squash: 0.1, hop: -2 }, ease: "out" },
      { t: 290, pose: { ...both({ sh: 112, el: 24, curl: 0, spread: 1 }), squash: -0.08, hop: 8 }, ease: "out" },
      { t: 350, pose: { L_sh: 100, R_sh: 118 } },
      { t: 410, pose: { L_sh: 114, R_sh: 102 } },
      { t: 470, pose: { L_sh: 104, R_sh: 114, hop: 0, squash: 0.05 } },
      { t: 800, pose: {} },
    ],
  },
  fallRecover: {
    // Tips, flails (elbows bent, hands up and in — never a T), sits down hard, stays down a beat,
    // pushes off, gets up with a small overshoot and settles. No pose is held flat into the end.
    keys: [
      { t: 120, pose: { lean: 6, squash: 0.06, hop: -1, ...both({ sh: 38, el: -30, spread: 1, curl: 0 }), L_fy: 4, L_fa: 20, lookY: -0.2 }, ease: "out" },
      { t: 270, pose: { lean: 10, squash: 0, hop: 1, ...both({ sh: 70, el: -52, spread: 1 }), eye: 0.1 }, ease: "out" },
      { t: 450, pose: { lean: 13, squash: 0.16, hop: -6, ...both({ sh: 14, el: -10, curl: 0.45, spread: 0 }), L_fy: 0, L_fa: 0, lookY: 0.6, eye: 0.35 }, ease: "in" },
      { t: 1250, pose: { lean: 12, squash: 0.15, hop: -6 } },
      { t: 1430, pose: { lean: 9, squash: 0.19, hop: -7, ...both({ sh: 22, el: 16, curl: 0.3 }), lookY: 0.2 }, ease: "inOut" },
      { t: 1650, pose: { lean: -3, squash: -0.05, hop: 2, ...both({ sh: 34, el: -6, curl: 0.2 }), lookY: 0, eye: 0 }, ease: "out" },
      { t: 1870, pose: { lean: 1, squash: 0.02, hop: 0 } },
      { t: 2150, pose: {} },
    ],
  },

  bellyPat: {
    keys: [
      { t: 220, pose: { L_ik: 1, R_ik: 1, L_front: 1, R_front: 1, L_ikX: 72, L_ikY: 208, R_ikX: 126, R_ikY: 210, L_wr: -70, R_wr: -64, L_curl: 0.1, R_curl: 0.1 }, ease: "out" },
      { t: 360, pose: { R_ikY: 204, squash: 0.02 } },
      { t: 470, pose: { R_ikY: 211, squash: 0 } },
      { t: 610, pose: { R_ikY: 205, squash: 0.02 } },
      { t: 900, pose: { R_ikY: 210, squash: 0 } },
      { t: 1200, pose: { L_ik: 0, R_ik: 0, L_front: 0, R_front: 0 } },
    ],
  },
  whoa: {
    // Hands up beside the face — they stay outside the silhouette, so they are drawn behind the
    // body like any raised arm (flipping both to the front layer at once was a one-frame jump).
    keys: [
      { t: 110, pose: { lean: 4, squash: 0.05, L_fx: 3, R_fy: 5 }, ease: "out" },
      { t: 300, pose: { ...both({ sh: 44, el: 74, wr: -12, spread: 0.9, curl: 0 }), lean: 6, R_fy: 0, R_fx: -2, squash: 0 }, ease: "out" },
      { t: 460, pose: { L_fy: 4, L_fx: -2 } },
      { t: 600, pose: { L_fy: 0 } },
      { t: 1050, pose: { lean: 3 } },
      { t: 1260, pose: { ...both({ sh: 30, el: 22, wr: -6, spread: 0.5 }), lean: 1, L_fx: 0, R_fx: 0 } },
      { t: 1460, pose: {} },
    ],
  },

  boop: {
    keys: [
      { t: 70, pose: { ...both({ sh: 70, el: 20, spread: 1, curl: 0 }), L_fy: 3, R_fy: 3, eye: 0.3 }, ease: "out" },
      { t: 260, pose: { L_fy: 0, R_fy: 0, eye: 0 } },
      { t: 560, pose: {} },
    ],
  },
  wipeBrow: {
    keys: [
      { t: 280, pose: { R_ik: 1, R_front: 1, R_ikX: 150, R_ikY: 112, R_wr: -95, R_curl: 0, R_spread: 0, lookY: -0.3, eye: 0.3 }, ease: "inOut" },
      { t: 700, pose: { R_ikX: 96, R_ikY: 106 }, ease: "inOut" },
      { t: 860, pose: { R_ikX: 128, R_ikY: 96, eye: 0 }, ease: "out" },
      { t: 1150, pose: { R_ik: 0.2 } },
      { t: 1400, pose: {} },
    ],
  },
  /** The walk itself is procedural (`applyWalk`); this only holds the arms a touch looser. */
  walk: {
    keys: [
      { t: 200, pose: { ...both({ curl: 0.3, spread: 0 }) } },
      { t: 2400, pose: { ...both({ curl: 0.3 }) } },
      { t: 2700, pose: {} },
    ],
  },
  scratchHead: {
    keys: [
      { t: 420, pose: { R_ik: 1, R_ikX: 158, R_ikY: 112, R_wr: -60, R_curl: 0.55, R_front: 1, lookX: 0.3, lookY: -0.3, lean: 2 }, ease: "inOut" },
      { t: 620, pose: { R_ikY: 106, R_curl: 0.8 } },
      { t: 780, pose: { R_ikY: 111, R_curl: 0.55 } },
      { t: 980, pose: { R_ikY: 105.5, R_curl: 0.8 } },
      { t: 1180, pose: { R_ikY: 110 } },
      { t: 1700, pose: {} },
    ],
  },
  footTap: {
    keys: [
      { t: 180, pose: { R_fy: 3.5, R_fa: 18 }, ease: "out" },
      { t: 300, pose: { R_fy: 0, R_fa: 0 }, ease: "in" },
      { t: 520, pose: { R_fy: 3, R_fa: 16 }, ease: "out" },
      { t: 640, pose: { R_fy: 0, R_fa: 0 }, ease: "in" },
      { t: 900, pose: {} },
    ],
  },
  lookAtHand: {
    keys: [
      { t: 450, pose: { L_sh: 52, L_el: 78, L_wr: -10, L_spread: 0.6, L_curl: 0, lookX: -0.55, lookY: -0.15, lean: -2 }, ease: "inOut" },
      { t: 800, pose: { L_curl: 0.5, L_spread: 0 } },
      { t: 1100, pose: { L_curl: 0, L_spread: 0.6 } },
      { t: 1500, pose: { lookX: -0.45 } },
      { t: 2000, pose: {} },
    ],
  },
  crossArms: {
    keys: [
      { t: 500, pose: { L_ik: 1, R_ik: 1, L_front: 1, R_front: 1, L_ikX: 110, L_ikY: 203, R_ikX: 92, R_ikY: 199, L_wr: -45, R_wr: -45, L_curl: 0.5, R_curl: 0.5, R_thumb: -0.5, L_thumb: -0.5 }, ease: "inOut" },
      { t: 2600, pose: { lean: 1.5 } },
      { t: 3200, pose: {} },
    ],
  },
  stretch: {
    keys: [
      { t: 500, pose: { ...both({ sh: 150, el: 18, curl: 0.3, spread: 0.3 }), squash: -0.07, lean: -2, eye: 0.6 }, ease: "inOut" },
      { t: 1000, pose: { lean: 2, L_sh: 156, R_sh: 146 } },
      { t: 1500, pose: { squash: 0.02, lean: 0, eye: 0 } },
      { t: 1900, pose: {} },
    ],
  },
};

export const GESTURE_SPEC = SPEC;

export const GESTURE_INDEX: Record<Gesture, number> = Object.fromEntries(GESTURES.map((g, i) => [g, i])) as Record<Gesture, number>;

/** Compiled once. The mirrored copy is how a left-handed wave or a point to the left is played. */
export const COMPILED: readonly CompiledGesture[] = GESTURES.map((g) => compileGesture(SPEC[g]));
export const COMPILED_MIRROR: readonly CompiledGesture[] = GESTURES.map((g) =>
  compileGesture({ ...SPEC[g], keys: SPEC[g].keys.map((k) => ({ ...k, pose: mirrorSpec(k.pose) })) })
);

export function gestureDuration(g: Gesture): number {
  return COMPILED[GESTURE_INDEX[g]].duration;
}

/**
 * Reduced motion: a gesture collapses to one pose change. The rig eases to the pose the gesture
 * holds longest (its most readable moment — the raised hand of a wave, the pointing arm), stays
 * there for `hold` ms and eases back; the reduced springs make both changes ≈ 250 ms cross-fades
 * with no travel past the target. `total` is when the gesture counts as finished.
 */
export interface ReducedGesture {
  /** Timeline time of the pose to show, ms (a key time, so the pose is exactly that key). */
  at: number;
  hold: number;
  total: number;
}

export const REDUCED_RETURN_MS = 320;

function reducedPlan(g: CompiledGesture): ReducedGesture {
  // The first key is the base pose and a one-shot's last key returns to it: neither is a pose.
  let best = Math.min(1, g.times.length - 1);
  let bestSpan = -1;
  for (let k = 1; k < g.times.length - 1; k++) {
    const span = g.times[k + 1] - g.times[k];
    if (span >= bestSpan) {
      best = k;
      bestSpan = span;
    }
  }
  const hold = Math.round(Math.max(450, Math.min(1000, g.duration * 0.5)));
  return { at: g.times[best], hold, total: hold + REDUCED_RETURN_MS };
}

export const REDUCED: readonly ReducedGesture[] = COMPILED.map(reducedPlan);

/** How long a gesture takes to finish under reduced motion, ms. */
export function reducedGestureDuration(g: Gesture): number {
  return REDUCED[GESTURE_INDEX[g]].total;
}
