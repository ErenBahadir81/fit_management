/**
 * Floo 3 — the skeleton. Pure numbers and worklets: no React, no Reanimated, no Skia objects.
 *
 * The character's limbs are no longer traced bitmaps swung about a pivot. Each arm is a
 * shoulder → elbow → wrist chain and each leg a hip → knee → ankle chain, measured off the
 * reference art (`Gemini_Generated_Image_…jpg`, mapped into the 200 × 290 body space by the parity
 * tool's own mapping: base-circle centre (100,158) r 62 ⇔ reference px (1416,790) r 328). Every
 * frame the chains are posed (forward kinematics, or two-bone IK when a hand or foot has a target)
 * and turned into path strings: a rubber-hose tube through the three joints, a mitten hand with a
 * thumb and three fingers, and a boot.
 *
 * All of the pose lives in one flat vector of channels (`CH`), so a mood, a gesture key, the idle
 * layer and IK are all the same kind of thing — numbers that a single spring layer then chases.
 */

// ── channels ───────────────────────────────────────────────────────────────

const ARM_KEYS = ["sh", "el", "wr", "curl", "spread", "thumb", "point", "front", "ik", "ikX", "ikY"] as const;
const LEG_KEYS = ["fx", "fy", "fa"] as const;
const BODY_KEYS = ["hop", "lean", "squash", "x", "mouth", "eye", "lookX", "lookY"] as const;

export type ArmKey = (typeof ARM_KEYS)[number];
export type LegKey = (typeof LEG_KEYS)[number];
export type BodyKey = (typeof BODY_KEYS)[number];
export type Channel = `L_${ArmKey}` | `R_${ArmKey}` | `L_${LegKey}` | `R_${LegKey}` | BodyKey;

/** Channel name → index into the pose vector. */
export const CH = (() => {
  const out: Record<string, number> = {};
  let i = 0;
  for (const side of ["L", "R"]) for (const k of ARM_KEYS) out[`${side}_${k}`] = i++;
  for (const side of ["L", "R"]) for (const k of LEG_KEYS) out[`${side}_${k}`] = i++;
  for (const k of BODY_KEYS) out[k] = i++;
  return out as Record<Channel, number>;
})();
export const CHANNEL_COUNT = Object.keys(CH).length;
export const CHANNELS = Object.keys(CH) as Channel[];

/** A partial pose, as authored in `poses.ts`. */
export type PoseSpec = Partial<Record<Channel, number>>;

/** Arm offsets inside the vector, so a worklet can read one side without string keys. */
export const ARM_BASE = { L: CH.L_sh, R: CH.R_sh } as const;
export const LEG_BASE = { L: CH.L_fx, R: CH.R_fx } as const;
export const A = { sh: 0, el: 1, wr: 2, curl: 3, spread: 4, thumb: 5, point: 6, front: 7, ik: 8, ikX: 9, ikY: 10 } as const;
export const LG = { fx: 0, fy: 1, fa: 2 } as const;

/**
 * The rest pose — every idle frame starts here. Angles are in degrees and measured the same way on
 * both sides: 0 is hanging straight down, positive swings the limb OUTWARD (away from the body),
 * 180 is straight up. `el` is added to `sh` for the forearm, so a positive elbow folds the forearm
 * further outward/up (a flex) and a negative one folds it in across the body (a clap).
 */
const REST_ARM: Record<ArmKey, number> = {
  sh: 25.9, el: -17, wr: -9, curl: 0.05, spread: 0.15, thumb: 0, point: 0, front: 0, ik: 0, ikX: 0, ikY: 0,
};
const REST_LEG: Record<LegKey, number> = { fx: 0, fy: 0, fa: 0 };

export function restVector(): number[] {
  const v = new Array<number>(CHANNEL_COUNT).fill(0);
  for (const side of ["L", "R"] as const) {
    for (const k of ARM_KEYS) v[CH[`${side}_${k}` as Channel]] = REST_ARM[k];
    for (const k of LEG_KEYS) v[CH[`${side}_${k}` as Channel]] = REST_LEG[k];
  }
  return v;
}
export const REST = restVector();

/** Fill a partial pose over a base vector. JS-thread helper for authoring. */
export function poseVector(spec: PoseSpec, base: readonly number[] = REST): number[] {
  const v = base.slice();
  for (const k in spec) {
    const i = CH[k as Channel];
    const val = spec[k as Channel];
    if (i !== undefined && typeof val === "number" && Number.isFinite(val)) v[i] = val;
  }
  return v;
}

/** Mirror a pose left ↔ right. Body lean, sideways shift and gaze flip sign. */
export function mirrorSpec(spec: PoseSpec): PoseSpec {
  const out: PoseSpec = {};
  for (const k in spec) {
    const val = spec[k as Channel] as number;
    if (k.startsWith("L_")) out[`R_${k.slice(2)}` as Channel] = k === "L_ikX" ? 200 - val : val;
    else if (k.startsWith("R_")) out[`L_${k.slice(2)}` as Channel] = k === "R_ikX" ? 200 - val : val;
    else out[k as Channel] = k === "lean" || k === "x" || k === "lookX" ? -val : val;
  }
  return out;
}

// ── skeleton, measured off the reference ───────────────────────────────────

/** Shoulders sit ~6 units inside the body contour, so the tube's cap closes behind the body. */
export const SHOULDER = { L: { x: 47.5, y: 176 }, R: { x: 152.5, y: 176 } } as const;
export const HIP = { L: { x: 85, y: 212 }, R: { x: 115, y: 212 } } as const;
/** Rest ankle positions — the feet are planted here in world space, not carried by the body. */
export const ANKLE = { L: { x: 86, y: 256.5 }, R: { x: 114, y: 256.5 } } as const;
export const UPPER_ARM = 22.2;
export const FOREARM = 19.4;
export const THIGH = 22.2;
export const SHIN = 22.6;

/**
 * Line weights. Measured outline-centre to outline-centre, both arms and legs are 13 units across
 * and the reference's contour is 1.8 thick; so the fill tube is 11.2 and the contour tube 14.8.
 */
export const LIMB_W = 11.2;
export const LINE_W = 1.8;
export const FINGER_W = 5.4;
export const THUMB_W = 5.8;

// ── small math ─────────────────────────────────────────────────────────────

export interface Pt {
  x: number;
  y: number;
}

function num(v: number): string {
  "worklet";
  if (!Number.isFinite(v)) return "0";
  return String(Math.round(v * 100) / 100);
}

export function deg(r: number): number {
  "worklet";
  return (r * 180) / Math.PI;
}
export function rad(d: number): number {
  "worklet";
  return (d * Math.PI) / 180;
}

/** An angle difference folded into (−180°, 180°]. */
export function wrapDeg(d: number): number {
  "worklet";
  if (!Number.isFinite(d)) return 0;
  let r = d % 360;
  if (r > 180) r -= 360;
  else if (r <= -180) r += 360;
  return r;
}

/**
 * A shoulder angle folded into (−120°, 240°]: the arm's own range, from folded in across the chest
 * round through hanging, out and straight up to just past it. Every angle an arm can reach has one
 * value here, and neighbouring poses have neighbouring values.
 */
export function unwrapShoulder(a: number): number {
  "worklet";
  let r = wrapDeg(a);
  if (r <= -120) r += 360;
  return r;
}

/**
 * A soft limit: identity inside [lo, hi], then an exponential approach to `lo − knee` / `hi +
 * knee`. A spring that overshoots a limit leans into it and comes back, instead of hitting a wall.
 */
export function softClamp(v: number, lo: number, hi: number, knee: number): number {
  "worklet";
  if (!Number.isFinite(v)) return Math.max(lo, Math.min(hi, 0));
  if (v > hi) return hi + knee * (1 - Math.exp(-(v - hi) / knee));
  if (v < lo) return lo - knee * (1 - Math.exp(-(lo - v) / knee));
  return v;
}

/** Direction of a limb segment for a signed side: `s = −1` left, `+1` right. 0° is down. */
export function dir(s: number, aDeg: number): Pt {
  "worklet";
  const a = rad(aDeg);
  return { x: s * Math.sin(a), y: Math.cos(a) };
}
/** The outward-facing normal to `dir(s, a)`. */
function outward(s: number, aDeg: number): Pt {
  "worklet";
  const a = rad(aDeg);
  return { x: s * Math.cos(a), y: -Math.sin(a) };
}
/** The side-signed angle of a world direction (inverse of `dir`). */
export function angleOf(s: number, dx: number, dy: number): number {
  "worklet";
  return deg(Math.atan2(s * dx, dy));
}

// ── body transform ─────────────────────────────────────────────────────────

export interface BodyXform {
  /** Pivot: the soles, under the body's centre. */
  ox: number;
  oy: number;
  tx: number;
  ty: number;
  lean: number;
  sx: number;
  sy: number;
  /** Hydration scale about the base-circle centre, applied before everything else. */
  k: number;
}

/** A body-space point, carried by the body: hydration (`k`, default `b.k`), squash, lean, then the hop / shift. */
export function bodyToWorld(p: Pt, b: BodyXform, k: number = b.k): Pt {
  "worklet";
  const hx = 100 + (p.x - 100) * k;
  const hy = 158 + (p.y - 158) * k;
  const dx = (hx - b.ox) * b.sx;
  const dy = (hy - b.oy) * b.sy;
  const a = rad(b.lean);
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return { x: b.ox + b.tx + dx * c - dy * sn, y: b.oy + b.ty + dx * sn + dy * c };
}

// ── kinematics ─────────────────────────────────────────────────────────────

export interface Chain {
  root: Pt;
  mid: Pt;
  end: Pt;
  /** World-signed angles of the two segments. */
  a1: number;
  a2: number;
}

/** Forward kinematics for one two-bone chain. */
export function fk(s: number, root: Pt, a1: number, a2: number, l1: number, l2: number): Chain {
  "worklet";
  const d1 = dir(s, a1);
  const mid = { x: root.x + d1.x * l1, y: root.y + d1.y * l1 };
  const d2 = dir(s, a2);
  const end = { x: mid.x + d2.x * l2, y: mid.y + d2.y * l2 };
  return { root, mid, end, a1, a2 };
}

/**
 * Analytic two-bone IK. The middle joint always bends OUTWARD (elbows out, knees out), which is
 * the cartoon convention and also the only choice that never folds a limb through the body.
 * Unreachable targets are clamped to 99.5 % of full reach, so the limb points at them straight
 * instead of popping.
 */
export function ik(s: number, root: Pt, target: Pt, l1: number, l2: number): { a1: number; a2: number } {
  "worklet";
  let dx = target.x - root.x;
  let dy = target.y - root.y;
  let d = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(d) || d < 1e-3) {
    dx = 0;
    dy = 1;
    d = 1e-3;
  }
  const dMin = Math.abs(l1 - l2) + 0.5;
  const dMax = (l1 + l2) * 0.995;
  const dc = Math.max(dMin, Math.min(dMax, d));
  const base = angleOf(s, dx, dy);
  const cosA = (l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc);
  const alpha = deg(Math.acos(Math.max(-1, Math.min(1, cosA))));
  const a1 = base + alpha;
  const d1 = dir(s, a1);
  const mx = root.x + d1.x * l1;
  const my = root.y + d1.y * l1;
  const ex = root.x + (dx / d) * dc;
  const ey = root.y + (dy / d) * dc;
  const a2 = angleOf(s, ex - mx, ey - my);
  return { a1, a2 };
}

// ── curves ─────────────────────────────────────────────────────────────────

/**
 * Samples a Catmull-Rom curve through root → mid → end. The curve passes through the elbow, so the
 * limb bends where the joint is, but the bend is round — a hose, not a hinge.
 */
function hose(c: Chain, samples: number): Pt[] {
  "worklet";
  const p = [c.root, c.root, c.mid, c.end, c.end];
  const out: Pt[] = [];
  const perSeg = Math.max(2, Math.round(samples / 2));
  for (let seg = 0; seg < 2; seg++) {
    const p0 = p[seg];
    const p1 = p[seg + 1];
    const p2 = p[seg + 2];
    const p3 = p[seg + 3];
    for (let i = 0; i < perSeg; i++) {
      const t = i / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push({ x: c.end.x, y: c.end.y });
  return out;
}

function polyline(pts: Pt[], from = 0, to = pts.length): string {
  "worklet";
  let s = "";
  for (let i = from; i < to; i++) s += `${i === from ? "M" : "L"}${num(pts[i].x)} ${num(pts[i].y)}`;
  return s;
}

/** A thin band just inside the limb's outer edge — the reference's specular stripe. */
function rimLine(pts: Pt[], s: number, offset: number, from: number, to: number): string {
  "worklet";
  const out: Pt[] = [];
  const n = pts.length;
  const a = Math.max(1, Math.floor(n * from));
  const b = Math.min(n - 1, Math.ceil(n * to));
  for (let i = a; i < b; i++) {
    const p = pts[i - 1];
    const q = pts[i + 1] ?? pts[i];
    const tx = q.x - p.x;
    const ty = q.y - p.y;
    const l = Math.sqrt(tx * tx + ty * ty) || 1;
    out.push({ x: pts[i].x + (s * ty * offset) / l, y: pts[i].y - (s * tx * offset) / l });
  }
  return polyline(out);
}

/** Closed Catmull-Rom through points, as cubics. Used for the palm and the boots. */
function closedSpline(pts: Pt[]): string {
  "worklet";
  const m = pts.length;
  let s = `M${num(pts[0].x)} ${num(pts[0].y)}`;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % m];
    const p3 = pts[(i + 2) % m];
    s += `C${num(p1.x + (p2.x - p0.x) / 6)} ${num(p1.y + (p2.y - p0.y) / 6)} ${num(p2.x - (p3.x - p1.x) / 6)} ${num(p2.y - (p3.y - p1.y) / 6)} ${num(p2.x)} ${num(p2.y)}`;
  }
  return s + "Z";
}

// ── hands ──────────────────────────────────────────────────────────────────

/**
 * The hand, in its own frame: `u` outward (away from the body), `v` along the hand's axis away
 * from the wrist. Measured off the reference's resting left hand with the axis straight down.
 * Three fingers and a thumb; each finger is a base knuckle and a direction.
 */
const PALM: readonly (readonly [number, number])[] = [
  [-1, 1.8], [6.5, 3.5], [10.4, 9.5], [10.2, 15.5], [6.8, 20.2], [0.5, 21.6], [-5.8, 20.4], [-9.8, 15.2], [-10.3, 8.8], [-7, 3.2],
];
const FINGERS: readonly { base: readonly [number, number]; ang: number; len: number }[] = [
  { base: [6.4, 16.5], ang: 8, len: 6.2 },
  { base: [0.6, 18.5], ang: 0, len: 7.4 },
  { base: [-5.4, 17.5], ang: -6, len: 6.4 },
];
const THUMB_BASE = [-7.8, 8.2] as const;

export interface HandGeo {
  palm: string;
  fingers: string;
  creases: string;
  thumb: string;
  /** Knuckle centre in world space — where a pointing hand's gaze should go. */
  tip: Pt;
}

export function handGeometry(
  s: number,
  wrist: Pt,
  axisDeg: number,
  curl: number,
  spread: number,
  thumb: number,
  point: number,
  scale = 1
): HandGeo {
  "worklet";
  const d = dir(s, axisDeg);
  const n = outward(s, axisDeg);
  const toWorld = (u: number, v: number): Pt => ({
    x: wrist.x + (n.x * u + d.x * v) * scale,
    y: wrist.y + (n.y * u + d.y * v) * scale,
  });

  const palmPts: Pt[] = [];
  for (let i = 0; i < PALM.length; i++) palmPts.push(toWorld(PALM[i][0], PALM[i][1]));

  const c = Math.max(0, Math.min(1, curl));
  const sp = Math.max(-0.5, Math.min(1.2, spread));
  const pt = Math.max(0, Math.min(1, point));
  let fingers = "";
  let creases = "";
  const tips: Pt[] = [];
  const bases: Pt[] = [];
  let tip = toWorld(0.6, 26);
  for (let i = 0; i < FINGERS.length; i++) {
    const f = FINGERS[i];
    // The index finger is the one nearest the thumb (i = 2); pointing keeps it straight and long.
    const isIndex = i === 2;
    const ci = isIndex ? c * (1 - pt) : Math.max(c, pt * 0.95);
    const len = f.len * (1 - 0.72 * ci) * (isIndex ? 1 + 0.45 * pt : 1);
    // Fan: outer finger outward, index inward. Curling tucks the tips in toward the thumb.
    const a = rad(f.ang * (1 + sp * 1.6) - ci * 18);
    const bu = f.base[0] * (1 + sp * 0.08);
    const bv = f.base[1] - ci * 2.5;
    const tu = bu + Math.sin(a) * len;
    const tv = bv + Math.cos(a) * len;
    const b = toWorld(bu, bv);
    const t = toWorld(tu, tv);
    bases.push(b);
    tips.push(t);
    fingers += `M${num(b.x)} ${num(b.y)}L${num(t.x)} ${num(t.y)}`;
    if (isIndex && pt > 0.5) tip = t;
  }
  // Creases between neighbouring fingers: only while the fingers are together. Spread apart, the
  // gap is real and the contour pass already draws it.
  const crease = Math.max(0, 1 - sp * 1.4);
  if (crease > 0.05) {
    for (let i = 0; i < 2; i++) {
      const m0 = { x: (bases[i].x + bases[i + 1].x) / 2, y: (bases[i].y + bases[i + 1].y) / 2 };
      const m1 = { x: (tips[i].x + tips[i + 1].x) / 2, y: (tips[i].y + tips[i + 1].y) / 2 };
      const ex = m0.x + (m1.x - m0.x) * (0.55 + 0.35 * crease);
      const ey = m0.y + (m1.y - m0.y) * (0.55 + 0.35 * crease);
      creases += `M${num(m0.x + (m1.x - m0.x) * 0.1)} ${num(m0.y + (m1.y - m0.y) * 0.1)}L${num(ex)} ${num(ey)}`;
    }
  }

  // Thumb: −1 folded across the fist, 0 the resting inward-down angle, +1 straight up the axis
  // (a thumbs-up when the hand points up).
  const th = Math.max(-1, Math.min(1, thumb));
  const restA = -38;
  const aTh = th >= 0 ? restA + (-150 - restA) * th : restA + (80 - restA) * -th;
  const lTh = 8.2 + (th > 0 ? 2.2 * th : -1.5 * th);
  const tb = toWorld(THUMB_BASE[0] + (th < 0 ? 2 * -th : 0), THUMB_BASE[1] + (th < 0 ? 3 * -th : 0));
  const ta = rad(aTh);
  const tt = toWorld(
    THUMB_BASE[0] + (th < 0 ? 2 * -th : 0) + Math.sin(ta) * lTh,
    THUMB_BASE[1] + (th < 0 ? 3 * -th : 0) + Math.cos(ta) * lTh
  );
  const thumbPath = `M${num(tb.x)} ${num(tb.y)}L${num(tt.x)} ${num(tt.y)}`;

  return { palm: closedSpline(palmPts), fingers, creases, thumb: thumbPath, tip };
}

// ── feet ───────────────────────────────────────────────────────────────────

/**
 * The boot, in its own frame: `u` along the toe (outward), `v` down. Outline centres, measured
 * off the reference's left foot with the ankle at the origin.
 */
const BOOT: readonly (readonly [number, number])[] = [
  [-5.5, -1], [-7.8, 6], [-6.6, 13.5], [0, 16.2], [9, 16.6], [18, 15.8], [23.6, 12.4], [24.4, 6.4], [19.5, 1.6], [11, 0.2], [4.5, -2.4],
];

export function bootPath(s: number, ankle: Pt, toeUpDeg: number, scale = 1): { boot: string; gloss: Pt } {
  "worklet";
  const a = rad(toeUpDeg);
  // Toe axis rotated up by `toeUpDeg`, and the boot's "down" axis rotated with it.
  const tx = s * Math.cos(a);
  const ty = -Math.sin(a);
  const dx = s * Math.sin(a);
  const dy = Math.cos(a);
  const at = (u: number, v: number): Pt => ({ x: ankle.x + (tx * u + dx * v) * scale, y: ankle.y + (ty * u + dy * v) * scale });
  const pts: Pt[] = [];
  for (let i = 0; i < BOOT.length; i++) pts.push(at(BOOT[i][0], BOOT[i][1]));
  return { boot: closedSpline(pts), gloss: at(14, 5.5) };
}

// ── whole limbs ────────────────────────────────────────────────────────────

export interface ArmGeo {
  tube: string;
  rim: string;
  hand: HandGeo;
  wrist: Pt;
  elbow: Pt;
  /** 0 behind the body, 1 forearm and hand in front of it. */
  front: number;
}

/**
 * Pose one arm. `v` is the pose vector, `base` the side's first channel, `lean` the body's lean in
 * degrees (the arm hangs from a leaning shoulder), `shoulder` the shoulder in world space.
 */
export function armGeometry(v: readonly number[], base: number, s: number, shoulder: Pt, lean: number, targetWorld: Pt | null): ArmGeo {
  "worklet";
  const leanS = -s * lean;
  let a1 = v[base + A.sh] + leanS;
  let a2 = a1 + v[base + A.el];
  const w = Math.max(0, Math.min(1, v[base + A.ik]));
  if (w > 0.001 && targetWorld) {
    const sol = ik(s, shoulder, targetWorld, UPPER_ARM, FOREARM);
    // Blend in angle space, so a hand easing onto a target follows an arc, not a straight line.
    // Blend in joint space: the shoulder angle in one fixed range (so a raised arm comes down
    // the outside, never over the head), and the elbow as a bend relative to the upper arm.
    const ikA1 = unwrapShoulder(sol.a1 - leanS) + leanS;
    const bend = a2 - a1;
    a1 = a1 + (ikA1 - a1) * w;
    a2 = a1 + bend + (wrapDeg(sol.a2 - sol.a1) - bend) * w;
  }
  a1 = softClamp(a1, -60 + leanS, 185 + leanS, 12);
  const chain = fk(s, shoulder, a1, a2, UPPER_ARM, FOREARM);
  const pts = hose(chain, 14);
  const axis = a2 + v[base + A.wr];
  const hand = handGeometry(s, chain.end, axis, v[base + A.curl], v[base + A.spread], v[base + A.thumb], v[base + A.point]);
  return {
    tube: polyline(pts),
    rim: rimLine(pts, s, LIMB_W * 0.27, 0.22, 0.86),
    hand,
    wrist: chain.end,
    elbow: chain.mid,
    front: v[base + A.front],
  };
}

export interface LegGeo {
  tube: string;
  rim: string;
  boot: string;
  gloss: Pt;
}

/** Pose one leg: the hip rides the body, the ankle is planted on the ground plus the pose offset. */
export function legGeometry(v: readonly number[], base: number, s: number, hip: Pt, ankleRest: Pt, groundShift: number): LegGeo {
  "worklet";
  const target = {
    x: ankleRest.x + groundShift + s * v[base + LG.fx],
    y: ankleRest.y - Math.max(-2, v[base + LG.fy]),
  };
  const sol = ik(s, hip, target, THIGH, SHIN);
  const chain = fk(s, hip, sol.a1, sol.a2, THIGH, SHIN);
  const pts = hose(chain, 12);
  // A foot off the ground dangles a little toe-down; planted, it follows the pose.
  const lift = Math.max(0, v[base + LG.fy]);
  const b = bootPath(s, chain.end, v[base + LG.fa] - Math.min(12, lift * 0.6));
  return { tube: polyline(pts), rim: rimLine(pts, s, LIMB_W * 0.27, 0.3, 0.8), boot: b.boot, gloss: b.gloss };
}

// ── springs ────────────────────────────────────────────────────────────────

/**
 * Per-channel spring constants: stiffness `k` (1/s²) and damping ratio `z`. The shoulder is the
 * stiffest joint of the arm and the wrist the loosest, so a fast shoulder move leaves the elbow and
 * the hand trailing 40–80 ms behind and overshooting a touch — follow-through for free.
 */
export const SPRING = (() => {
  const k = new Array<number>(CHANNEL_COUNT).fill(260);
  const z = new Array<number>(CHANNEL_COUNT).fill(0.7);
  /** Speed limits, units per second. Only the IK goals have one: see below. */
  const vmax = new Array<number>(CHANNEL_COUNT).fill(Infinity);
  const set = (name: string, kk: number, zz: number) => {
    k[CH[name as Channel]] = kk;
    z[CH[name as Channel]] = zz;
  };
  for (const side of ["L", "R"]) {
    set(`${side}_sh`, 300, 0.62);
    set(`${side}_el`, 190, 0.55);
    set(`${side}_wr`, 140, 0.5);
    set(`${side}_curl`, 420, 0.85);
    set(`${side}_spread`, 380, 0.7);
    set(`${side}_thumb`, 380, 0.75);
    set(`${side}_point`, 420, 0.85);
    set(`${side}_front`, 900, 1);
    set(`${side}_ik`, 260, 0.9);
    set(`${side}_ikX`, 240, 0.8);
    set(`${side}_ikY`, 240, 0.8);
    // A hand that is already reaching and gets a new goal far away (from the chin to the top of
    // the head) must travel there, not arrive in two frames: cap it at ≈ 7 units a frame.
    vmax[CH[`${side}_ikX` as Channel]] = 420;
    vmax[CH[`${side}_ikY` as Channel]] = 420;
    set(`${side}_fx`, 420, 0.72);
    set(`${side}_fy`, 520, 0.68);
    set(`${side}_fa`, 360, 0.6);
  }
  set("hop", 380, 0.55);
  set("lean", 200, 0.6);
  set("squash", 420, 0.45);
  set("x", 200, 0.8);
  set("mouth", 300, 0.8);
  set("eye", 400, 0.9);
  set("lookX", 300, 0.8);
  set("lookY", 300, 0.8);
  return { k, z, vmax };
})();

/**
 * Reduced motion: every channel on the same critically damped spring. It starts from rest, so a
 * pose change eases in and out over ≈ 250 ms, and it never overshoots — a cross-fade between poses
 * with no travel past the target, no bounce and no whip.
 */
export const SPRING_REDUCED = {
  k: new Array<number>(CHANNEL_COUNT).fill(520),
  z: new Array<number>(CHANNEL_COUNT).fill(1),
};

/**
 * One semi-implicit Euler step of every channel toward its target. `dt` in seconds; sub-stepped
 * so a dropped frame cannot blow the stiffer springs up. `vmax` (units/s per channel) caps speed.
 */
export function stepSprings(
  x: number[],
  vel: number[],
  target: readonly number[],
  dt: number,
  k: readonly number[],
  z: readonly number[],
  vmax?: readonly number[]
): number {
  "worklet";
  const steps = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / steps;
  let energy = 0;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < x.length; i++) {
      const kk = k[i];
      const c = 2 * z[i] * Math.sqrt(kk);
      const t = target[i];
      if (!Number.isFinite(t)) continue;
      const a = kk * (t - x[i]) - c * vel[i];
      vel[i] += a * h;
      if (vmax && vel[i] > vmax[i]) vel[i] = vmax[i];
      else if (vmax && vel[i] < -vmax[i]) vel[i] = -vmax[i];
      x[i] += vel[i] * h;
      if (!Number.isFinite(x[i]) || !Number.isFinite(vel[i])) {
        x[i] = t;
        vel[i] = 0;
      }
    }
  }
  for (let i = 0; i < x.length; i++) energy += Math.abs(vel[i]) + Math.abs(target[i] - x[i]);
  return energy;
}

// ── gestures ───────────────────────────────────────────────────────────────

export type Ease = "inOut" | "out" | "in" | "hold";

export interface GestureKey {
  /** ms from the start. */
  t: number;
  pose: PoseSpec;
  /** Easing INTO this key. */
  ease?: Ease;
}

export interface GestureSpec {
  keys: GestureKey[];
  /** Loop the key range instead of returning to the base pose. */
  loop?: boolean;
}

/** A compiled gesture: dense key values per touched channel, NaN meaning "the base pose". */
export interface CompiledGesture {
  times: number[];
  ease: number[];
  channels: number[];
  /** values[k * channels.length + j] */
  values: number[];
  duration: number;
  loop: boolean;
}

const EASE_ID: Record<Ease, number> = { inOut: 0, out: 1, in: 2, hold: 3 };

export function compileGesture(g: GestureSpec): CompiledGesture {
  const touched = new Set<number>();
  for (const key of g.keys) for (const name in key.pose) if (CH[name as Channel] !== undefined) touched.add(CH[name as Channel]);
  const channels = [...touched].sort((a, b) => a - b);
  const keys = [...g.keys].sort((a, b) => a.t - b.t);
  // Every gesture begins and (unless it loops) ends on the base pose: fade in, fade back.
  if (keys[0].t > 0) keys.unshift({ t: 0, pose: {} });
  const values: number[] = [];
  const last = new Array<number>(channels.length).fill(NaN);
  for (let ki = 0; ki < keys.length; ki++) {
    for (let j = 0; j < channels.length; j++) {
      const name = CHANNELS[channels[j]];
      const val = keys[ki].pose[name];
      if (typeof val === "number") last[j] = val;
      // The first key starts from, and the last key (of a one-shot) returns to, the base pose.
      else if (ki === 0 || (ki === keys.length - 1 && !g.loop)) last[j] = NaN;
      values.push(last[j]);
    }
  }
  // IK goals never travel from or back to the base pose: a reach blends in on its weight
  // (`trackIkTargets`), so the goal holds its first authored value before it and its last after.
  for (let j = 0; j < channels.length; j++) {
    const name = CHANNELS[channels[j]];
    if (!name.endsWith("_ikX") && !name.endsWith("_ikY")) continue;
    let first = NaN;
    for (let ki = 0; ki < keys.length && !Number.isFinite(first); ki++) first = values[ki * channels.length + j];
    let prev = first;
    for (let ki = 0; ki < keys.length; ki++) {
      const at = ki * channels.length + j;
      if (Number.isFinite(values[at])) prev = values[at];
      else values[at] = prev;
    }
  }
  const duration = keys[keys.length - 1].t;
  return {
    times: keys.map((k) => k.t),
    ease: keys.map((k) => EASE_ID[k.ease ?? "inOut"]),
    channels,
    values,
    duration,
    loop: !!g.loop,
  };
}

function ease(id: number, u: number): number {
  "worklet";
  const t = Math.max(0, Math.min(1, u));
  if (id === 1) return 1 - (1 - t) * (1 - t) * (1 - t);
  if (id === 2) return t * t * t;
  if (id === 3) return t < 1 ? 0 : 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Write a gesture's value at `tMs` over `out` (which already holds the base pose). Returns false
 * once a non-looping gesture has finished. `weight` scales the gesture's pull toward its keys —
 * idle fidgets play at a fraction, so they never fight a mood.
 */
export function applyGesture(g: CompiledGesture, tMs: number, out: number[], weight = 1): boolean {
  "worklet";
  const n = g.times.length;
  if (n === 0) return false;
  let t = tMs;
  if (g.loop && g.duration > 0) t = tMs % g.duration;
  if (!g.loop && t >= g.duration) return false;
  let k = 0;
  while (k < n - 2 && t >= g.times[k + 1]) k++;
  const t0 = g.times[k];
  const t1 = g.times[k + 1] ?? t0;
  const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
  const e = ease(g.ease[k + 1] ?? 0, u);
  const m = g.channels.length;
  for (let j = 0; j < m; j++) {
    const ch = g.channels[j];
    const base = out[ch];
    let a = g.values[k * m + j];
    let b = g.values[(k + 1) * m + j];
    if (!Number.isFinite(a)) a = base;
    if (!Number.isFinite(b)) b = base;
    const val = a + (b - a) * e;
    out[ch] = base + (val - base) * weight;
  }
  return true;
}

// ── IK targets ─────────────────────────────────────────────────────────────

/** One coordinate (`wantX` → x, else y) of an arm's FK wrist in body space, from its sh/el angles. */
export function wristInBody(v: readonly number[], base: number, s: number, wantX: boolean): number {
  "worklet";
  const a1 = rad(v[base + A.sh]);
  const a2 = rad(v[base + A.sh] + v[base + A.el]);
  const sh = s < 0 ? SHOULDER.L : SHOULDER.R;
  return wantX ? sh.x + s * (Math.sin(a1) * UPPER_ARM + Math.sin(a2) * FOREARM) : sh.y + Math.cos(a1) * UPPER_ARM + Math.cos(a2) * FOREARM;
}

/** A new IK goal further than this from the current one is reached by letting go first. */
const RETARGET_FAR = 30;
/** …and the goal is swapped once the weight has fallen below this. */
const RETARGET_SNAP = 0.03;

/**
 * Keeps each arm's IK target channels honest, after every layer has written the target pose.
 *
 * A reach blends in JOINT space: the target is put at the goal the moment a reach starts (while
 * its weight is still zero, so nothing visible moves) and the rising weight swings the shoulder and
 * the elbow from their FK angles to the IK solution. Moving the target instead — from the hand to
 * the goal in a straight line — dragged the hand through the shoulder whenever the arm started
 * raised, and the IK solution flipped over the head. Letting go is the mirror image: the target
 * stays where it was while the weight falls. With no reach at all the target is parked on the hand.
 */
export function trackIkTargets(x: number[], vel: number[], tgt: number[]): void {
  "worklet";
  for (let side = 0; side < 2; side++) {
    const base = side === 0 ? ARM_BASE.L : ARM_BASE.R;
    const s = side === 0 ? -1 : 1;
    const idle = x[base + A.ik] < 0.02;
    if (tgt[base + A.ik] > 0.001) {
      const dx = tgt[base + A.ikX] - x[base + A.ikX];
      const dy = tgt[base + A.ikY] - x[base + A.ikY];
      if (!idle && dx * dx + dy * dy > RETARGET_FAR * RETARGET_FAR) {
        // Already reaching and the new goal is across the body (chin → pointing, belly → brow):
        // a straight run between the two can pass over the shoulder, where the solution flips.
        // Let go first; the reach starts over from the arm's FK pose once the weight is low.
        if (x[base + A.ik] < RETARGET_SNAP) {
          x[base + A.ikX] = tgt[base + A.ikX];
          x[base + A.ikY] = tgt[base + A.ikY];
          vel[base + A.ikX] = 0;
          vel[base + A.ikY] = 0;
        } else {
          tgt[base + A.ik] = 0;
          tgt[base + A.ikX] = x[base + A.ikX];
          tgt[base + A.ikY] = x[base + A.ikY];
        }
      } else if (idle) {
        x[base + A.ikX] = tgt[base + A.ikX];
        x[base + A.ikY] = tgt[base + A.ikY];
        vel[base + A.ikX] = 0;
        vel[base + A.ikY] = 0;
      }
    } else if (idle) {
      const wx = wristInBody(x, base, s, true);
      const wy = wristInBody(x, base, s, false);
      tgt[base + A.ikX] = wx;
      tgt[base + A.ikY] = wy;
      x[base + A.ikX] = wx;
      x[base + A.ikY] = wy;
      vel[base + A.ikX] = 0;
      vel[base + A.ikY] = 0;
    } else {
      tgt[base + A.ikX] = x[base + A.ikX];
      tgt[base + A.ikY] = x[base + A.ikY];
    }
  }
}

/** IK weight at which a reaching hand crosses the body's edge, near enough. */
export const FRONT_AT_IK = 0.3;

/**
 * Decide, per arm, whether it is drawn in front of the body this frame. `front` is a layer switch,
 * not a motion, so it must flip when the hand is at the body's edge, not over the belly. A pose
 * asks for "in front" with its `front` channel; for an arm that is reaching (IK) the switch waits
 * until the weight has carried the hand in (≥ FRONT_AT_IK), and on the way out it holds until the
 * weight has carried the hand back out. Before this, a hand patting the belly vanished behind the
 * body in one frame the moment the gesture's last key started, halfway through letting go.
 */
export function resolveFront(x: number[], tgt: readonly number[]): void {
  "worklet";
  for (let side = 0; side < 2; side++) {
    const base = side === 0 ? ARM_BASE.L : ARM_BASE.R;
    const w = x[base + A.ik];
    const reaching = tgt[base + A.ik] > 0.001 || w > 0.02;
    const want = tgt[base + A.front] > 0.5 || (x[base + A.front] > 0.5 && reaching && w > FRONT_AT_IK);
    x[base + A.front] = want && (!reaching || w > FRONT_AT_IK) ? 1 : 0;
  }
}

// ── idle loops ─────────────────────────────────────────────────────────────

/**
 * One cycle of an idle loop as a phase `u` ∈ [0, 1) → −1 … 1: rises from −1 to 1 over the first
 * `rise` of the cycle and falls back over the rest, sine-eased both ways. Driven by a phase rather
 * than a repeating tween, a loop can change speed (a mood's tempo) without restarting or jumping.
 */
export function loopCurve(u: number, rise: number): number {
  "worklet";
  const r = Math.max(0.05, Math.min(0.95, rise));
  const t = u - Math.floor(u);
  if (t < r) return -Math.cos((Math.PI * t) / r);
  return Math.cos((Math.PI * (t - r)) / (1 - r));
}

/** Breath: in over `BREATH_IN` s, out over 1.15× that, at a mood tempo of 1. */
export const BREATH_IN = 1.4;
export const BREATH_AMP = 0.025;

// ── walking ────────────────────────────────────────────────────────────────

/** 0 → 1 → 0 over a swing, with zero slope at both ends: a foot leaves and lands softly. */
function swingBump(u: number): number {
  "worklet";
  const t = Math.max(0, Math.min(1, u));
  const b = Math.sin(Math.PI * t);
  return b * b;
}

/**
 * A front-on walk cycle, added on top of whatever the pose is. `phase` in radians; `amt` 0…1
 * fades the whole cycle in and out so starting and stopping never pops. One stride = 2π: the left
 * foot swings over (0, π), the right over (π, 2π), and both are down at the contacts 0 and π.
 *
 *  - The planted foot is planted: no lift, no slide, no toe roll while the other one swings.
 *  - The swinging foot peels off toe-first, lifts, reaches in a touch and sets down.
 *  - The body drops into the "down" position just after each contact (weight landing, a little
 *    squash) and rises highest on the passing position, so two bobs per stride.
 *  - It sways over the planted foot and tips a degree or two toward it.
 *  - The arms counter-swing the legs: the arm opposite the swinging leg comes forward (in a
 *    front view: the elbow folds in and the hand rises), with the elbow trailing the shoulder.
 *    The two sides are not mirror copies — the right swings a touch wider.
 */
export function applyWalk(out: number[], phase: number, amt: number): void {
  "worklet";
  if (amt <= 0.001) return;
  const TAU = Math.PI * 2;
  const p = ((phase % TAU) + TAU) % TAU;
  const uL = p < Math.PI ? p / Math.PI : -1;
  const uR = p >= Math.PI ? (p - Math.PI) / Math.PI : -1;
  const liftL = uL >= 0 ? swingBump(uL) : 0;
  const liftR = uR >= 0 ? swingBump(uR) : 0;
  out[CH.L_fy] += liftL * 7.5 * amt;
  out[CH.R_fy] += liftR * 7.5 * amt;
  // Toe-off then toe-up to land: the toe angle leads the lift by a quarter of the swing.
  out[CH.L_fa] += (uL >= 0 ? Math.sin(Math.PI * uL) * swingBump(Math.min(1, uL * 1.3)) * 9 : 0) * amt;
  out[CH.R_fa] += (uR >= 0 ? Math.sin(Math.PI * uR) * swingBump(Math.min(1, uR * 1.3)) * 9 : 0) * amt;
  // The swinging foot tucks in under the body at the passing position.
  out[CH.L_fx] += -liftL * 1.6 * amt;
  out[CH.R_fx] += -liftR * 1.6 * amt;
  // Two bobs per stride: lowest ≈ 0.25 rad after each contact, highest on passing.
  const bob = -Math.cos(2 * (p - 0.25));
  out[CH.hop] += (bob * 2.3 + 0.4) * amt;
  out[CH.squash] += Math.max(0, -bob) * 0.03 * amt;
  // Sway over the planted foot: right while the left swings, left while the right swings.
  const sway = Math.sin(p - 0.15);
  out[CH.x] += sway * 1.8 * amt;
  out[CH.lean] += sway * 1.6 * amt;
  // Arms: the side opposite the swinging leg comes forward. Elbow lags the shoulder.
  const fwdR = Math.sin(p - 0.3); // > 0 while the left leg swings → right arm forward
  const fwdRel = Math.sin(p - 0.75);
  out[CH.R_sh] += fwdR * 5.5 * amt;
  out[CH.R_el] += -fwdRel * 13 * amt;
  out[CH.L_sh] += -fwdR * 4.5 * amt;
  out[CH.L_el] += fwdRel * 11 * amt;
  out[CH.R_curl] += Math.max(0, fwdR) * 0.2 * amt;
  out[CH.L_curl] += Math.max(0, -fwdR) * 0.2 * amt;
}
