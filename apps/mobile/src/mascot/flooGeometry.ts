/**
 * Pure geometry for Floo. Everything here is a plain function of numbers so the character's shape
 * can be unit-tested without mounting anything — the component below it only interpolates.
 *
 * Anything the component calls from `useAnimatedStyle` / `useAnimatedProps` is marked `"worklet"`.
 * Without it the babel plugin leaves the function on the JS side, the UI runtime cannot call it
 * synchronously, and the resulting `undefined` reaches the SVG as NaN — which iOS turns into a
 * `CALayerInvalidGeometry` crash rather than a catchable JS error. `saccadeTarget` is deliberately
 * *not* a worklet: it runs from a `setTimeout` and needs `Math.random()` on the JS thread.
 *
 * Coordinate space: a 200 × 240 viewBox, origin top-left, y growing downward (SVG convention).
 * The body is centred on x = 100.
 */

/**
 * Body outline: one closed droplet — a *rounded* crown (never a cone), shoulders that meet the base
 * circle tangentially, and a big round bottom. Drawn as a single path so there is no seam to catch
 * the light where a separate tip would have overlapped.
 */
export const DROPLET_PATH = "M94 56A8 8 0 0 1 106 56C114 66 166.5 106 166.5 148A66.5 66.5 0 1 1 33.5 148C33.5 106 86 66 94 56Z";

/** Centre of the base circle — the pivot everything on the face is laid out from. */
export const BODY_CENTRE = { x: 100, y: 148 } as const;
export const BODY_RADIUS = 66.5;

/** Face layout. Wide-set, big, slightly-above-centre eyes read as young — the point of the silhouette. */
export const EYE = { left: 74, right: 126, y: 122, rx: 17, ry: 19 } as const;
export const BROW_Y = 94;
export const MOUTH_Y = 152;
export const CHEEK = { left: 52, right: 148, y: 144, rx: 15, ry: 9 } as const;
/** Exactly on the silhouette edge. Arms are drawn in front and hug the outline from there. */
export const SHOULDER = { left: { x: 35, y: 150 }, right: { x: 165, y: 150 } } as const;
/**
 * Arms: a curved path from the shoulder, because a straight segment with a ball on the end reads as
 * a lollipop, not a limb. Drawn in the shoulder's local space and rotated as one group.
 */
export const ARM_PATH = "M0 0C-4 12 -7 22 -8 29";
export const MITTEN = { x: -10, y: 36, rx: 11.5, ry: 12.5 } as const;
/** Boots tuck under the base arc so they read as attached feet, not loose props. */
export const BOOT = { y: 202, height: 22, left: 65, right: 107, width: 28 } as const;

/** How far a pupil may drift from the centre of its eye. */
export const GAZE_RADIUS = 8;

/** Squash is clamped so an over-eager spring can never invert the body. */
export const MAX_SQUASH = 0.35;

export interface Scale2 {
  scaleX: number;
  scaleY: number;
}

/**
 * Squash and stretch that preserves area — the difference between a character that is alive and
 * one that is being scaled. Positive squashes (wide and flat), negative stretches (tall and thin).
 */
export function volumePreservingScale(squash: number): Scale2 {
  "worklet"; // read from `useAnimatedStyle` on the UI runtime — see the note on `n` below
  const s = Math.max(-MAX_SQUASH, Math.min(MAX_SQUASH, Number.isFinite(squash) ? squash : 0));
  const scaleY = 1 - s;
  return { scaleX: 1 / scaleY, scaleY };
}

/** Trim a number to a short, stable string so paths stay readable and diffable. */
function n(value: number): string {
  // `mouthPath` runs on the UI runtime, so every helper it reaches must be a worklet too.
  "worklet";
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

/** Below this the two lips coincide and the filled mouth disappears entirely. */
const MIN_MOUTH_OPEN = 2.6;

export interface MouthShape {
  halfWidth: number;
  /** Gap between the lips at the centre. */
  open: number;
  /** How far the middle of the mouth drops below the corners: positive smiles, negative frowns. */
  curve: number;
}

/**
 * The mouth as one closed shape (two quadratics, corner to corner), drawn around its own origin so
 * the caller only has to translate it. Filled rather than stroked — a stroke reads as a line on a
 * balloon, a fill reads as a mouth.
 */
export function mouthPath({ halfWidth, open, curve }: MouthShape): string {
  /*
   * Called from `useAnimatedProps`. Without the directive Reanimated treats it as a *remote*
   * function: the UI runtime cannot call it synchronously, the result is `undefined`, and the
   * NaN geometry that follows terminates the app with `CALayerInvalidGeometry`.
   */
  "worklet";
  const w = Math.max(0, halfWidth);
  const o = Math.max(MIN_MOUTH_OPEN, open);
  const c = Number.isFinite(curve) ? curve : 0;
  return `M${n(-w)} 0Q0 ${n(c)} ${n(w)} 0Q0 ${n(c + 2 * o)} ${n(-w)} 0Z`;
}

export interface Point {
  x: number;
  y: number;
}

/** Keep a gaze on or inside the pupil's circle of travel. */
export function clampGaze(x: number, y: number, radius = GAZE_RADIUS): Point {
  "worklet";
  const d = Math.hypot(x, y);
  if (d <= radius || d === 0) return { x, y };
  return { x: (x / d) * radius, y: (y / d) * radius };
}

/** A random glance target, uniform over the disc (√ keeps it from clustering in the middle). */
export function saccadeTarget(radius = GAZE_RADIUS): Point {
  const r = radius * Math.sqrt(Math.random());
  const t = Math.random() * Math.PI * 2;
  return { x: r * Math.cos(t), y: r * Math.sin(t) };
}
