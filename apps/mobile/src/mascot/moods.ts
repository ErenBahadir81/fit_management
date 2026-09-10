import type { Mood } from "@fitfloow/core";

export type { Mood };

/** Pose targets per mood. All numbers are in Floo's 100×120 SVG space (degrees for angles). */
export interface Pose {
  /** Eye height multiplier 0..1 (1 = wide open). */
  eyeOpen: number;
  /** Pupil drift. */
  eyeX: number;
  eyeY: number;
  /** Brow rotation (+ = inner ends down → worried; − = raised). Mirrored for the right brow. */
  browTilt: number;
  /** Brow vertical offset (− = raised). */
  browY: number;
  /** Mouth control-point offset: + smile, − frown. */
  mouth: number;
  /** Mouth half-width. */
  mouthW: number;
  /** Arm rotations (deg) around the shoulders; − lifts the left arm, + lifts the right. */
  armL: number;
  armR: number;
  /** Vertical hop in px (positive = up). */
  hop: number;
  /** Whole-body tilt in degrees. */
  tilt: number;
  /** Cheek blush opacity 0..1. */
  cheeks: number;
  /** Flame-tip sway amplitude multiplier. */
  sway: number;
}

export const MOOD_POSE: Record<Mood, Pose> = {
  happy: { eyeOpen: 1, eyeX: 0, eyeY: 0, browTilt: 0, browY: 0, mouth: 8, mouthW: 9, armL: -20, armR: 20, hop: 0, tilt: 0, cheeks: 0.7, sway: 1 },
  cheer: { eyeOpen: 1, eyeX: 0, eyeY: -1, browTilt: -6, browY: -3, mouth: 13, mouthW: 12, armL: -150, armR: 150, hop: 10, tilt: -3, cheeks: 1, sway: 1.6 },
  think: { eyeOpen: 0.85, eyeX: 3, eyeY: -2, browTilt: -10, browY: -2, mouth: 1, mouthW: 6, armL: -10, armR: 95, hop: 0, tilt: 4, cheeks: 0.3, sway: 0.6 },
  sleepy: { eyeOpen: 0.22, eyeX: 0, eyeY: 1, browTilt: 4, browY: 2, mouth: 3, mouthW: 5, armL: 8, armR: -8, hop: 0, tilt: 8, cheeks: 0.3, sway: 0.35 },
  flex: { eyeOpen: 0.9, eyeX: 0, eyeY: 0, browTilt: 8, browY: -1, mouth: 10, mouthW: 10, armL: -20, armR: 125, hop: 2, tilt: -5, cheeks: 0.8, sway: 1.3 },
  worried: { eyeOpen: 1, eyeX: -2, eyeY: 0, browTilt: 16, browY: -2, mouth: -6, mouthW: 8, armL: -5, armR: 5, hop: 0, tilt: 2, cheeks: 0.2, sway: 0.5 },
};

export const MOOD_LABEL_TR: Record<Mood, string> = {
  happy: "mutlu",
  cheer: "coşkulu",
  think: "düşünceli",
  sleepy: "uykulu",
  flex: "güçlü",
  worried: "endişeli",
};

export const FLOO_COLORS = {
  bodyStart: "#6D5DF6",
  bodyEnd: "#8B7CFF",
  cheeks: "#FFB4C6",
  eyes: "#0F141C",
  highlight: "#FFFFFF",
  arm: "#5A4AE3",
} as const;
