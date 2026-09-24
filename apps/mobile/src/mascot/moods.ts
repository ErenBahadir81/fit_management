import type { Mood as CoreMood } from "@fitfloow/core";
import { GAZE_RADIUS } from "./flooGeometry";

/**
 * Every face Floo can pull. The first six are the moods the API can send (`@fitfloow/core`'s
 * `Mood`); the last four are local — screens reach for them directly when they know better than the
 * message catalogue does (a finished workout is `proud`, a PR is `hype`).
 */
export const FLOO_MOODS = ["happy", "cheer", "think", "sleepy", "flex", "worried", "proud", "sad", "hype", "curious"] as const;
export type FlooMood = (typeof FLOO_MOODS)[number];

/**
 * Compile-time guarantee that every mood the server can send is one Floo can actually draw. If core
 * grows a mood and this file does not, the build breaks here rather than at runtime with a blank face.
 */
type Renderable<A extends B, B> = A;
export type Mood = Renderable<CoreMood, FlooMood>;

/**
 * Pose targets, all in Floo's 200 × 240 SVG space (degrees for angles, pixels for offsets).
 * Every field is spring-interpolated between moods, so any two poses blend into something sensible.
 */
export interface Pose {
  /** Upper-lid opening, 0 (shut) … 1 (wide). */
  eyeOpen: number;
  /** Lower lid pushing up, 0 … 1. This is what separates a polite smile from a real one. */
  eyeSquint: number;
  /** Pupil drift from centre; kept inside `gazeRadius`. */
  gazeX: number;
  gazeY: number;
  gazeRadius?: number;
  /** Brow rotation, + = inner ends down (worried), − = inner ends up (raised). Mirrored right. */
  browTilt: number;
  /** Brow vertical offset, − = raised. */
  browY: number;
  /** Middle of the mouth relative to its corners: + smiles, − frowns. */
  mouthCurve: number;
  /** Gap between the lips. */
  mouthOpen: number;
  mouthHalfWidth: number;
  /** Blush opacity, 0 … 1. */
  cheeks: number;
  /** Arm rotation about the shoulders (deg); − raises the left arm, + raises the right. */
  armL: number;
  armR: number;
  /** How far off the ground, in px. */
  hop: number;
  /** Whole-body tilt (deg). */
  tilt: number;
  /** Pose squash: + wide and flat, − tall and thin. Area-preserving (see `volumePreservingScale`). */
  squash: number;
  /** Amplitude multiplier for the secondary motion (tip curl, scarf tails). */
  sway: number;
  /** Idle breathing rate multiplier — a sleepy Floo breathes slower than a hyped one. */
  tempo: number;
}

export const MOOD_POSE: Record<FlooMood, Pose> = {
  happy: {
    eyeOpen: 1, eyeSquint: 0.15, gazeX: 0, gazeY: 0,
    browTilt: 0, browY: 0,
    mouthCurve: 10, mouthOpen: 5, mouthHalfWidth: 21,
    cheeks: 0.7, armL: -8, armR: 8, hop: 0, tilt: 0, squash: 0, sway: 1, tempo: 1,
  },
  cheer: {
    eyeOpen: 0.95, eyeSquint: 0.5, gazeX: 0, gazeY: -1,
    browTilt: -8, browY: -4,
    mouthCurve: 15, mouthOpen: 13, mouthHalfWidth: 24,
    cheeks: 1, armL: -145, armR: 145, hop: 12, tilt: -3, squash: -0.05, sway: 1.7, tempo: 1.4,
  },
  think: {
    eyeOpen: 0.85, eyeSquint: 0.1, gazeX: 4, gazeY: -3,
    browTilt: -9, browY: -2,
    mouthCurve: 3, mouthOpen: 4, mouthHalfWidth: 14,
    cheeks: 0.3, armL: -8, armR: 118, hop: 0, tilt: 5, squash: 0.02, sway: 0.6, tempo: 0.8,
  },
  sleepy: {
    eyeOpen: 0.14, eyeSquint: 0, gazeX: 0, gazeY: 1.5,
    browTilt: 5, browY: 3,
    mouthCurve: 4, mouthOpen: 4, mouthHalfWidth: 12,
    cheeks: 0.3, armL: 8, armR: -8, hop: 0, tilt: 9, squash: 0.05, sway: 0.3, tempo: 0.55,
  },
  flex: {
    eyeOpen: 0.9, eyeSquint: 0.35, gazeX: 0, gazeY: 0,
    browTilt: 9, browY: -1,
    mouthCurve: 11, mouthOpen: 8, mouthHalfWidth: 22,
    cheeks: 0.85, armL: -22, armR: 128, hop: 2, tilt: -5, squash: 0.04, sway: 1.2, tempo: 1.1,
  },
  worried: {
    eyeOpen: 1, eyeSquint: 0, gazeX: -2.5, gazeY: 0.5,
    browTilt: -16, browY: -3,
    mouthCurve: -7, mouthOpen: 4, mouthHalfWidth: 18,
    cheeks: 0.2, armL: -5, armR: 5, hop: 0, tilt: 2, squash: 0.02, sway: 0.5, tempo: 0.9,
  },
  proud: {
    eyeOpen: 0.7, eyeSquint: 0.45, gazeX: 0, gazeY: -1,
    browTilt: -3, browY: -6,
    mouthCurve: 9, mouthOpen: 4, mouthHalfWidth: 19,
    cheeks: 0.75, armL: -22, armR: 22, hop: 1, tilt: 0, squash: -0.06, sway: 0.9, tempo: 0.95,
  },
  sad: {
    eyeOpen: 0.8, eyeSquint: 0, gazeX: 0, gazeY: 3.5,
    browTilt: -13, browY: 4,
    mouthCurve: -10, mouthOpen: 4, mouthHalfWidth: 17,
    cheeks: 0.15, armL: 12, armR: -12, hop: 0, tilt: 3, squash: 0.07, sway: 0.35, tempo: 0.7,
  },
  hype: {
    eyeOpen: 1, eyeSquint: 0.2, gazeX: 0, gazeY: -2,
    browTilt: -12, browY: -7,
    mouthCurve: 13, mouthOpen: 14, mouthHalfWidth: 26,
    cheeks: 1, armL: -165, armR: 165, hop: 16, tilt: 0, squash: -0.08, sway: 2, tempo: 1.7,
  },
  curious: {
    eyeOpen: 1, eyeSquint: 0, gazeX: 5, gazeY: -1,
    browTilt: -6, browY: -4,
    mouthCurve: 5, mouthOpen: 5, mouthHalfWidth: 14,
    cheeks: 0.45, armL: -12, armR: 26, hop: 0, tilt: 11, squash: 0.02, sway: 0.8, tempo: 1,
  },
};

export const MOOD_LABEL_TR: Record<FlooMood, string> = {
  happy: "mutlu",
  cheer: "coşkulu",
  think: "düşünceli",
  sleepy: "uykulu",
  flex: "güçlü",
  worried: "endişeli",
  proud: "gururlu",
  sad: "üzgün",
  hype: "heyecanlı",
  curious: "meraklı",
};

export { GAZE_RADIUS };

/**
 * The v1 SVG Floo's palette (today the web fallback when CanvasKit does not load). Floo blue body,
 * the same `floo` colour as the theme tokens and Floo 3, with amber knit for the scarf and boots.
 *
 * The body family was violet when the app's brand was; it moved to blue with one HSL transform
 * (hue −49°, saturation ×0.89, lightness −2.5%, chosen so the old `bodyMid` lands exactly on
 * `floo` #69C8F1). The body render `assets/mascot/floo-body.png` went through the same transform,
 * so the lids below, sampled off that render, still vanish into it on a blink.
 */
export const FLOO_COLORS = {
  /** Body gradient, light rim → core → shaded base. */
  bodyLight: "#93D9F9",
  bodyMid: "#69C8F1",
  bodyDeep: "#44A1CD",
  /** Bounce light on the shaded side, so the base does not read as a dead shadow. */
  bounce: "#76CDF7",
  rim: "#C8ECFC",
  highlight: "#FFFFFF",
  eye: "#141A26",
  /** Reflected light in the lower half of the iris. */
  eyeLift: "#3A3F52",
  mouth: "#2A1030",
  tongue: "#F2708C",
  cheeks: "#FF9DB4",
  mitten: "#52B6DE",
  /**
   * Eyelid fill, sampled from floo-body.png across the eye band (SVG y 103…141). The rendered body
   * is much lighter there than `bodyMid` because of the key light, so lids need their own pair.
   */
  lidLight: "#C3E6FB",
  lidDeep: "#AFDBF1",
  scarf: "#F5A524",
  scarfAlt: "#FFF0D6",
  boot: "#D98A12",
  bootDark: "#A6650A",
  shadow: "#2E576D",
} as const;
