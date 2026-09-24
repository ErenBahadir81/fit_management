/**
 * Floo v2 — the parametric droplet. Every visual state of the character is one `FlooParams`
 * record; moods are presets, triggers are temporary detours, and the idle layer adds on top.
 *
 * Nothing here touches React or Reanimated: it is plain data plus one clamp, so the shape of a
 * mood can be reasoned about (and tested) without mounting a canvas.
 */

export interface FlooParams {
  /** + squat and wide, − tall and thin. Volume preserving (`scaleX = 1/scaleY`). */
  squash: number;
  /** Body tilt in degrees, pivoting on the ground. */
  lean: number;
  /** Height off the ground in px of the 200×240 unit space. */
  hop: number;
  /** Antenna: − droops back/left, + stands proud. */
  /** −1 droops the crown further left, +1 straightens it upright. 0 is the traced rest pose. */
  tipBend: number;
  /** Antenna length multiplier. */
  tipLength: number;
  /** Upper lid: 1 open, 0 shut. */
  eyeOpen: number;
  /** Lower lid pushed up — the difference between a grin and a stare. */
  eyeSquint: number;
  lookX: number;
  lookY: number;
  /** − raised. */
  browY: number;
  /** + inner ends down (worry), − inner ends up. */
  browAngle: number;
  /** + smile, − frown. */
  mouthCurve: number;
  /** Depth of the mouth floor below the corner line, in body units. */
  mouthOpen: number;
  mouthWidth: number;
  blush: number;
  /** Specular + saturation. Hydration rides in on this. */
  brightness: number;
  /** Idle loop speed multiplier. */
  tempo: number;
  /**
   * Limb swing in degrees, hinged at the shoulder / hip. Positive is *outward* for every limb:
   * the renderer already mirrors the right-hand pair, so `armR: 12` and `armL: 12` both mean
   * "12° away from the body". Arms sweep far enough (≈160°) to reach straight overhead; legs only
   * shuffle. 0 on all four is the traced rest pose, which is why every idle frame still matches
   * the approved reference exactly.
   */
  armL: number;
  armR: number;
  legL: number;
  legR: number;
}

export const MOODS = ["idle", "happy", "celebrate", "sad", "worried", "sleepy", "think", "proud", "energetic"] as const;
export type Mood = (typeof MOODS)[number];

export const TRIGGERS = [
  "mealLogged",
  "goalHit",
  "streakUp",
  "missedDay",
  "overTarget",
  "waterLogged",
  "setCompleted",
  "workoutDone",
  "measurementLogged",
  "volumeWarning",
  "goalAdjustProposal",
  "greet",
  "tap",
] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const MOOD_PARAMS: Record<Mood, FlooParams> = {
  idle: {
    squash: 0, lean: 0, hop: 0, tipBend: 0, tipLength: 1.0,
    eyeOpen: 1.0, eyeSquint: 0.1, lookX: 0, lookY: 0,
    browY: -2, browAngle: 0, mouthCurve: 5, mouthOpen: 12.8, mouthWidth: 13.5,
    blush: 0.4, brightness: 0.7, tempo: 1.0,
    armL: 0, armR: 0, legL: 0, legR: 0,
  },
  happy: {
    squash: -0.03, lean: 0, hop: 0, tipBend: 0.35, tipLength: 1.05,
    eyeOpen: 0.95, eyeSquint: 0.35, lookX: 0, lookY: 0,
    browY: -2, browAngle: -4, mouthCurve: 7, mouthOpen: 15.1, mouthWidth: 15,
    blush: 0.8, brightness: 0.9, tempo: 1.15,
    armL: 12, armR: 12, legL: 0, legR: 0,
  },
  celebrate: {
    squash: -0.05, lean: -3, hop: 0, tipBend: 0.8, tipLength: 1.15,
    eyeOpen: 0.9, eyeSquint: 0.5, lookX: 0, lookY: 0,
    browY: -6, browAngle: -10, mouthCurve: 9, mouthOpen: 19.2, mouthWidth: 17,
    blush: 1.0, brightness: 1.0, tempo: 1.6,
    armL: 135, armR: 135, legL: 6, legR: 6,
  },
  sad: {
    squash: 0.07, lean: 3, hop: 0, tipBend: -0.32, tipLength: 0.9,
    eyeOpen: 0.75, eyeSquint: 0, lookX: 0, lookY: 0.45,
    browY: 6, browAngle: 15, mouthCurve: -8, mouthOpen: 1.5, mouthWidth: 14,
    blush: 0.15, brightness: 0.45, tempo: 0.7,
    armL: -6, armR: -6, legL: -5, legR: -5,
  },
  worried: {
    squash: 0.02, lean: -2, hop: 0, tipBend: -0.28, tipLength: 0.95,
    eyeOpen: 1.0, eyeSquint: 0, lookX: -0.2, lookY: 0,
    browY: 3, browAngle: 9, mouthCurve: -6, mouthOpen: 1.5, mouthWidth: 14,
    blush: 0.2, brightness: 0.6, tempo: 1.1,
    armL: 26, armR: 34, legL: -2, legR: -5,
  },
  sleepy: {
    squash: 0.05, lean: 8, hop: 0, tipBend: -0.3, tipLength: 0.93,
    eyeOpen: 0.15, eyeSquint: 0, lookX: 0, lookY: 0.2,
    browY: 3, browAngle: 4, mouthCurve: 4, mouthOpen: 4.9, mouthWidth: 12,
    blush: 0.3, brightness: 0.55, tempo: 0.55,
    armL: -4, armR: -4, legL: 4, legR: 0,
  },
  think: {
    squash: 0.01, lean: 4, hop: 0, tipBend: 0.1, tipLength: 1.0,
    eyeOpen: 0.9, eyeSquint: 0.1, lookX: 0.45, lookY: -0.55,
    browY: -3, browAngle: -6, mouthCurve: 2, mouthOpen: 3.5, mouthWidth: 11,
    blush: 0.3, brightness: 0.7, tempo: 0.8,
    armL: 0, armR: 0, legL: 0, legR: 0,
  },
  proud: {
    squash: -0.05, lean: -1, hop: 0, tipBend: 0.5, tipLength: 1.08,
    eyeOpen: 0.75, eyeSquint: 0.45, lookX: 0, lookY: -0.2,
    browY: -5, browAngle: -3, mouthCurve: 8, mouthOpen: 9, mouthWidth: 15,
    blush: 0.85, brightness: 0.95, tempo: 1.0,
    armL: 0, armR: 0, legL: 0, legR: 0,
  },
  energetic: {
    squash: -0.04, lean: 0, hop: 0, tipBend: 0.55, tipLength: 1.1,
    eyeOpen: 1.0, eyeSquint: 0.25, lookX: 0, lookY: -0.1,
    browY: -5, browAngle: -6, mouthCurve: 8, mouthOpen: 16, mouthWidth: 15.5,
    blush: 0.75, brightness: 1.0, tempo: 1.4,
    armL: 0, armR: 0, legL: 0, legR: 0,
  },
};

/**
 * Brow weight per mood. A heavy brow on a sad face reads as a scowl, so `sad` gets a thinner one.
 * Not a `FlooParams` field: it is a drawing weight, not a pose.
 */
export const MOOD_BROW_WEIGHT: Record<Mood, number> = {
  idle: 5.5,
  happy: 5.5,
  celebrate: 5.8,
  sad: 4.6,
  worried: 5.2,
  sleepy: 5,
  think: 5.4,
  proud: 5.5,
  energetic: 5.7,
};

/** Turkish labels, for the accessibility name — the app speaks Turkish. */
export const MOOD_LABEL_TR: Record<Mood, string> = {
  idle: "sakin",
  happy: "mutlu",
  celebrate: "kutluyor",
  sad: "üzgün",
  worried: "endişeli",
  sleepy: "uykulu",
  think: "düşünceli",
  proud: "gururlu",
  energetic: "enerjik",
};

export const FLOO_MODEL_COLORS = {
  /** Flat body colour. The reference is cel-shaded: one fill, one bottom shade, two rim shades. */
  bodyMid: "#6BC3E9",
  /** The body fill only. Pre-compensated for the flat `dull` wash that the idle brightness lays
   *  over the body but NOT over the limbs, so both land on the reference's measured #6EC3E9. */
  bodyFill: "#69C8F1",
  bodyLight: "#7FD4F6",
  bodyEdge: "#5CACDD",
  /** The main shade — a band across the bottom, not the left. */
  bodyShade: "#52AAE0",
  rimRight: "#4D9AD0",
  rimLeft: "#57A4D0",
  /** Sampled from the core of the reference's own contour stroke: rgb(55,112,157). */
  outline: "#37709D",
  /** Eye contour is thin except for a heavy upper lid. */
  lidDark: "#22416D",
  eyeLine: "#2B6B99",
  /** Only the thin rim arcs: the reference draws them nearly black-navy, not contour blue. */
  eyeRim: "#1B3A60",
  gloss: "#B9EBFD",
  eye: "#193952",
  eyeWhite: "#FFFFFF",
  brow: "#324468",
  blush: "#E6F0FA",
  /** Sampled from the shadowed interior of the reference's open mouth: rgb(115,33,39). */
  mouth: "#732127",
  /** The mouth is outlined in a dark navy, NOT the body contour blue — sampled off the reference. */
  mouthLine: "#383F5E",
  teeth: "#FFFFFF",
  tongue: "#D98583",
  shadow: "#2B6B99",
  highlight: "#FFFFFF",
  shoe: "#77C1E4",
  /** The specular band the reference paints just inside every limb's outer edge. Sampled. */
  limbRim: "#94DAF9",
  /** Finger/toe splits and the boot cuff — lighter than the contour, so they read as creases. */
  limbCrease: "#4383B1",
  armShade: "#4D94C8",
  armInner: "#37729E",
  armOuter: "#83CDF2",
  /** Laid over the body at `1 - brightness` — a thirsty drop goes grey. */
  dull: "#8FA6B8",
} as const;

const RANGES: Record<keyof FlooParams, readonly [number, number]> = {
  squash: [-0.35, 0.35],
  lean: [-15, 15],
  hop: [0, 30],
  tipBend: [-1, 1],
  tipLength: [0.6, 1.3],
  eyeOpen: [0, 1],
  eyeSquint: [0, 1],
  lookX: [-1, 1],
  lookY: [-1, 1],
  browY: [-8, 6],
  browAngle: [-20, 20],
  mouthCurve: [-12, 16],
  mouthOpen: [0, 26],
  mouthWidth: [8, 30],
  blush: [0, 1],
  brightness: [0, 1],
  tempo: [0.5, 1.8],
  // The ceiling is the *total*, so the follow-through lag can never breach it. 135° plus the
  // shoulder ride (see `shoulderRide`) is the cheer V; 142° leaves the overshoot somewhere to go.
  armL: [-40, 142],
  armR: [-40, 142],
  legL: [-35, 35],
  legR: [-35, 35],
};

/** Clamp one parameter into its documented range, NaN-safe. Worklet-callable. */
export function clampParam(key: keyof FlooParams, value: number): number {
  "worklet";
  const [lo, hi] = RANGES[key];
  const v = Number.isFinite(value) ? value : lo <= 0 && hi >= 0 ? 0 : lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/** Clamp a whole record. Used at the edges (props, presets) so no NaN ever reaches a path. */
export function clampParams(params: Partial<FlooParams>, base: FlooParams = MOOD_PARAMS.idle): FlooParams {
  "worklet";
  const merged = { ...base, ...params } as FlooParams;
  const out = {} as FlooParams;
  (Object.keys(RANGES) as (keyof FlooParams)[]).forEach((k) => {
    out[k] = clampParam(k, merged[k]);
  });
  return out;
}

export const PARAM_RANGES = RANGES;
