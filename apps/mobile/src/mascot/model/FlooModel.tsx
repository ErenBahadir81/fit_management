import React, { useEffect, useMemo, useRef } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Blur, Canvas, Circle, Group, Oval, Path, RadialGradient, Rect } from "@shopify/react-native-skia";
import {
  Easing,
  cancelAnimation,
  useAnimatedReaction,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { springs } from "../../theme/motion";
import {
  ARM_CREASE_L,
  ARM_CREASE_R,
  ARM_LINE_L,
  ARM_LINE_R,
  ARM_PATH_L,
  ARM_PATH_R,
  ARM_RIM_L,
  ARM_RIM_R,
  BODY,
  BROW_L,
  BROW_R,
  BROW_W,
  CHEEK,
  CHIN,
  EYE_L,
  FACE_W,
  GLINT,
  EYE_R,
  GAZE_RADIUS,
  FOOT_Y,
  GROUND_Y,
  IRIS_L,
  IRIS_R,
  IRIS_RX_L,
  IRIS_RY_L,
  IRIS_RX_R,
  IRIS_RY_R,
  IRIS_R_C,
  LEG_CREASE_L,
  LEG_CREASE_R,
  LEG_PATH_L,
  LEG_PATH_R,
  LEG_RIM_L,
  LEG_RIM_R,
  LIMB_CLIP,
  PIVOT_ARM_L,
  PIVOT_ARM_R,
  PIVOT_LEG_L,
  PIVOT_LEG_R,
  SHOE_CLIP,
  MOUTH,
  OUTLINE_W,
  SHADOW,
  arcPath,
  bodyPath,
  browPath,
  capsulePath,
  clampGaze,
  flickPath,
  mouthFloorY,
  mouthLipY,
  mouthPath,
  saccadeTarget,
  tipAnchor,
  volumePreservingScale,
} from "./geometry";
import { FLOO_MODEL_COLORS, FLOO_MODEL_COLORS as C, MOOD_BROW_WEIGHT, MOOD_LABEL_TR, MOOD_PARAMS, clampParam, type FlooParams, type Mood, type Trigger } from "./params";

const VB = { w: 200, h: 290 } as const;
export const FLOO_MODEL_ASPECT = VB.h / VB.w;

const LID_RX = 19;
const LID_RY = 18;
/** Lids are body-coloured, so a blink reads as the drop closing over itself. */
const LID_COLOR = FLOO_MODEL_COLORS.bodyMid;
/** The two flicks that spin off the tip, as offsets from the apex. */
/** Resting tilt of each brow, degrees — outer ends up, the left one steeper. */
const BROW_TILT_L = BROW_L.tilt;
const BROW_TILT_R = BROW_R.tilt;
const FLICKS = [
  { dx: -16, dy: -20, size: 6.5, delay: 0 },
  { dx: -30, dy: -6, size: 4.5, delay: 90 },
] as const;

export interface FlooModelProps {
  mood?: Mood;
  /** Width in px; height is 1.2×. */
  size?: number;
  /** 0…1. Independent of mood: scales the body, the colour and the specular. */
  hydration?: number;
  /** Externally driven gaze, −1…1 each axis (pointer / touch). */
  look?: { x: number; y: number };
  /** Change the *key* to fire; the same key twice does nothing. */
  trigger?: { name: Trigger; key: number } | null;
  onTriggerEnd?: (name: Trigger) => void;
  /** Cosmetic slot — a Skia element, anchored at the tip. */
  accessory?: React.ReactNode;
  /** Idle loops. Off inside long lists. */
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** An ellipse as an SVG path string. `Path` and `clip` both parse strings, so nothing here has to
 *  touch the `Skia` object — which on web is only usable after CanvasKit has loaded. */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
}

function blinkDelay() {
  return 2600 + Math.random() * 2600;
}
function saccadeDelay() {
  return 1800 + Math.random() * 2800;
}
/**
 * How far the shoulder itself rides out and up as an arm is raised.
 *
 * Pure rotation about a fixed pivot cannot make these short arms read as a cheer: past ~90° the
 * hands simply swing out sideways at shoulder height and the pose reads as a T / aeroplane. Real
 * shoulders do not stay put — they lift and open as the arms go up. So beyond 60° the whole arm
 * group slides outward and upward on a linear ramp, reaching 9 out / 6 up at 135°, which is what
 * lifts the hands clear above and outside the head. Zero at ≤60°, so rest and every low pose are
 * bit-for-bit untouched.
 */
function shoulderRide(angle: number): { out: number; up: number } {
  "worklet";
  const t = angle <= 60 ? 0 : Math.min(1, (angle - 60) / 75);
  return { out: t * 9, up: t * 6 };
}

/** Degrees → radians, worklet-callable so the limb transforms can use it on the UI thread. */
function rad(deg: number): number {
  "worklet";
  return (deg * Math.PI) / 180;
}

function leanDelay() {
  return 6000 + Math.random() * 4000;
}

/**
 * Raise a limb to `to`, then wobble it around that angle at ~8 Hz for 400 ms — the "shake the
 * water off" move. `delayMs` staggers the second arm so the pair never moves as one rigid bar;
 * `phase` flips the first wobble when the two are wanted out of step instead. Returned as sequence
 * *steps*, so the caller still owns how the limb finally settles.
 */
function shake(to: number, amp: number, phase: 1 | -1, delayMs = 0) {
  const steps: number[] = [
    withDelay(delayMs, withTiming(-6, { duration: 90, easing: Easing.out(Easing.quad) })),
    withSpring(to, { damping: 12, stiffness: 260 }),
  ];
  // 400 ms / 8 Hz → six half-cycles of ~62 ms. Linear inside a wobble: an eased jitter reads mushy.
  for (let i = 0; i < 6; i++) {
    steps.push(withTiming(to + amp * phase * (i % 2 === 0 ? 1 : -1), { duration: 62, easing: Easing.linear }));
  }
  return steps;
}

/**
 * Floo v2 — a limbless droplet drawn entirely in Skia from seventeen numbers.
 *
 * The character is one closed path plus a face; there is nothing rigged, so every bit of life has
 * to come out of the numbers: an area-preserving breath (it flattens on the out-breath), a blink
 * that is never on a metronome, saccades on their own schedule, a tip that lags the body and
 * overshoots before it settles, and hops that crouch before they leave the ground.
 *
 * Every animated value lives on the UI thread. There is no per-frame React state anywhere.
 */

/**
 * Rim shades as open arcs of the base circle (bottom → each side). A blurred stroke of an open
 * arc fades out at its ends by itself; clipping a full-body stroke to a rect left a hard
 * horizontal seam across the face at the clip's top edge.
 */
const RIM_ARC_LEFT = "M89.2 219.1A62 62 0 0 1 38.2 152.6";
const RIM_ARC_RIGHT = "M161.8 152.6A62 62 0 0 1 110.8 219.1";

export function FlooModel({
  mood = "idle",
  size = 200,
  hydration = 1,
  look,
  trigger = null,
  onTriggerEnd,
  accessory,
  animate = true,
  style,
  testID,
}: FlooModelProps) {
  const reduce = useReducedMotion();
  const loops = animate && !reduce;
  const width = size;
  const height = size * FLOO_MODEL_ASPECT;
  const k = size / VB.w;

  const preset = MOOD_PARAMS[mood];

  // ── mood layer ──────────────────────────────────────────────────────────
  const squash = useSharedValue(preset.squash);
  const lean = useSharedValue(preset.lean);
  const hop = useSharedValue(preset.hop);
  const tipBend = useSharedValue(preset.tipBend);
  const tipLength = useSharedValue(preset.tipLength);
  const eyeOpen = useSharedValue(preset.eyeOpen);
  const eyeSquint = useSharedValue(preset.eyeSquint);
  const moodLookX = useSharedValue(preset.lookX);
  const moodLookY = useSharedValue(preset.lookY);
  const browYv = useSharedValue(preset.browY);
  const browAngle = useSharedValue(preset.browAngle);
  const mouthCurve = useSharedValue(preset.mouthCurve);
  const mouthOpen = useSharedValue(preset.mouthOpen);
  const mouthWidth = useSharedValue(preset.mouthWidth);
  const blush = useSharedValue(preset.blush);
  const brightness = useSharedValue(preset.brightness);
  const tempo = useSharedValue(preset.tempo);
  const browWeight = useSharedValue(MOOD_BROW_WEIGHT[mood]);
  const armLv = useSharedValue(preset.armL);
  const armRv = useSharedValue(preset.armR);
  const legLv = useSharedValue(preset.legL);
  const legRv = useSharedValue(preset.legR);

  // ── idle layer (additive, always underneath) ────────────────────────────
  const breath = useSharedValue(0);
  const blink = useSharedValue(1);
  const microLean = useSharedValue(0);
  const sacX = useSharedValue(0);
  const sacY = useSharedValue(0);
  /** −1 … +1, a very slow weight shift. One value drives the lean, the counter-swing of both
   *  arms and the relaxed leg, so they can never drift out of phase with each other. */
  const wshift = useSharedValue(0);
  /** One-shot micro-gestures (foot tap / hand fidget / shrug) ride on their own layer so a
   *  gesture can fire mid-weight-shift without cancelling it. */
  const gArmL = useSharedValue(0);
  const gArmR = useSharedValue(0);
  const gLegL = useSharedValue(0);
  const gLegR = useSharedValue(0);
  const gSquash = useSharedValue(0);

  // ── trigger layer (additive, transient) ─────────────────────────────────
  const tSquash = useSharedValue(0);
  const tHop = useSharedValue(0);
  const tLean = useSharedValue(0);
  const tBright = useSharedValue(0);
  const tSquint = useSharedValue(0);
  const tArmL = useSharedValue(0);
  const tArmR = useSharedValue(0);
  const tLegL = useSharedValue(0);
  const tLegR = useSharedValue(0);

  // ── pointer gaze + tip follow-through ───────────────────────────────────
  const gazeX = useSharedValue(0);
  const gazeY = useSharedValue(0);
  const hydra = useSharedValue(hydration);
  const tipLag = useSharedValue(preset.lean);
  /** Soft springs chasing the body's lean and height. The *difference* between the chaser and the
   *  body is the follow-through: arms trail a lean and a hop, overshoot, then settle. */
  const armLag = useSharedValue(preset.lean);
  const hopLag = useSharedValue(0);
  /** 0 → 1 once per flick; drives both droplets off the tip. */
  const flick = useSharedValue(0);

  // ── mood transitions ────────────────────────────────────────────────────
  useEffect(() => {
    const p: FlooParams = MOOD_PARAMS[mood];
    const soft = (v: number) => (reduce ? withTiming(v, { duration: 150 }) : withSpring(v, springs.gentle));
    const body = (v: number) => (reduce ? withTiming(v, { duration: 150 }) : withSpring(v, springs.bouncy));
    squash.set(body(p.squash));
    lean.set(body(p.lean));
    hop.set(body(p.hop));
    tipBend.set(soft(p.tipBend));
    tipLength.set(soft(p.tipLength));
    eyeOpen.set(soft(p.eyeOpen));
    eyeSquint.set(soft(p.eyeSquint));
    moodLookX.set(soft(p.lookX));
    moodLookY.set(soft(p.lookY));
    browYv.set(soft(p.browY));
    browAngle.set(soft(p.browAngle));
    mouthCurve.set(soft(p.mouthCurve));
    mouthOpen.set(soft(p.mouthOpen));
    mouthWidth.set(soft(p.mouthWidth));
    blush.set(withTiming(p.blush, { duration: 320, easing: Easing.out(Easing.cubic) }));
    brightness.set(withTiming(p.brightness, { duration: 320, easing: Easing.out(Easing.cubic) }));
    tempo.set(withTiming(p.tempo, { duration: 320, easing: Easing.out(Easing.cubic) }));
    browWeight.set(withTiming(MOOD_BROW_WEIGHT[mood], { duration: 320, easing: Easing.out(Easing.cubic) }));
    armLv.set(body(p.armL));
    armRv.set(body(p.armR));
    legLv.set(body(p.legL));
    legRv.set(body(p.legR));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, reduce]);

  useEffect(() => {
    const h = Number.isFinite(hydration) ? Math.max(0, Math.min(1, hydration)) : 1;
    hydra.set(reduce ? withTiming(h, { duration: 150 }) : withSpring(h, springs.gentle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydration, reduce]);

  useEffect(() => {
    if (!look) return;
    const g = { x: Math.max(-1, Math.min(1, look.x || 0)), y: Math.max(-1, Math.min(1, look.y || 0)) };
    const cfg = reduce ? undefined : { damping: 16, stiffness: 180, mass: 0.7 };
    gazeX.set(cfg ? withSpring(g.x, cfg) : withTiming(g.x, { duration: 150 }));
    gazeY.set(cfg ? withSpring(g.y, cfg) : withTiming(g.y, { duration: 150 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look?.x, look?.y, reduce]);

  // ── idle loops ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loops) {
      cancelAnimation(breath);
      cancelAnimation(wshift);
      breath.set(0);
      wshift.set(0);
      microLean.set(0);
      gArmL.set(0);
      gArmR.set(0);
      gLegL.set(0);
      gLegR.set(0);
      gSquash.set(0);
      blink.set(1);
      sacX.set(0);
      sacY.set(0);
      return;
    }
    // Breath is a squash, not a scale: flatter on the way out, taller on the way in.
    const d = 1400 / Math.max(0.35, MOOD_PARAMS[mood].tempo);
    breath.set(
      withRepeat(
        withSequence(
          withTiming(0.025, { duration: d, easing: Easing.inOut(Easing.sin) }),
          withTiming(-0.025, { duration: d * 1.15, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );
    // The weight shift: 8–12 s of leaning onto one foot and back. Deliberately much slower than
    // the breath and on a prime-ish period, so the two never land on the same beat twice.
    const w = (9000 + Math.random() * 3000) / Math.max(0.35, MOOD_PARAMS[mood].tempo);
    wshift.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: w, easing: Easing.inOut(Easing.sin) }),
          withTiming(-1, { duration: w * 1.12, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );
    return () => {
      cancelAnimation(breath);
      cancelAnimation(wshift);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loops, mood]);

  useEffect(() => {
    if (!loops) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      t = setTimeout(() => {
        // A double blink now and then — a perfectly regular blink is uncanny.
        const twice = Math.random() < 0.22;
        const one = [
          withTiming(0.02, { duration: 60, easing: Easing.in(Easing.quad) }),
          withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
        ];
        blink.set(withSequence(...(twice ? [...one, withTiming(0.02, { duration: 55 }), withTiming(1, { duration: 120 })] : one)));
        run();
      }, blinkDelay());
    };
    run();
    return () => {
      if (t) clearTimeout(t);
    };
  }, [loops, blink]);

  useEffect(() => {
    if (!loops) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      t = setTimeout(() => {
        const s = saccadeTarget(3.4);
        // Saccades land hard; eyes do not ease into a fixation.
        sacX.set(withTiming(s.x, { duration: 90, easing: Easing.out(Easing.quad) }));
        sacY.set(withTiming(s.y, { duration: 90, easing: Easing.out(Easing.quad) }));
        run();
      }, saccadeDelay());
    };
    run();
    return () => {
      if (t) clearTimeout(t);
    };
  }, [loops, sacX, sacY]);

  useEffect(() => {
    if (!loops) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      t = setTimeout(() => {
        const to = (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.4);
        microLean.set(withSequence(withSpring(to, { damping: 14, stiffness: 60 }), withSpring(0, { damping: 16, stiffness: 50 })));
        run();
      }, leanDelay());
    };
    run();
    return () => {
      if (t) clearTimeout(t);
    };
  }, [loops, microLean]);

  // A micro-gesture every 9–15 s: a foot tap, a hand fidget or a shrug, picked at random and
  // scaled ±30 %, so the character is never caught doing the same little thing on a beat.
  useEffect(() => {
    if (!loops) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    let first = true;
    const run = () => {
      t = setTimeout(() => {
        const amp = 0.7 + Math.random() * 0.6;
        const pick = Math.random();
        if (pick < 0.36) {
          // Foot tap — one toe, up and straight back down.
          const leg = Math.random() < 0.5 ? gLegL : gLegR;
          leg.set(
            withSequence(
              withTiming(6 * amp, { duration: 250, easing: Easing.out(Easing.quad) }),
              withSpring(0, { damping: 11, stiffness: 220 })
            )
          );
        } else if (pick < 0.72) {
          // Hand fidget — one arm out and back, a spring each way so it never snaps.
          const arm = Math.random() < 0.5 ? gArmL : gArmR;
          arm.set(
            withSequence(
              withSpring(8 * amp, { damping: 12, stiffness: 190 }),
              withSpring(0, { damping: 14, stiffness: 130 })
            )
          );
        } else {
          // Shrug — both shoulders, with the body squashing into it so it reads as one motion.
          const up = withSequence(
            withTiming(5 * amp, { duration: 180, easing: Easing.out(Easing.cubic) }),
            withDelay(140, withSpring(0, springs.gentle))
          );
          gArmL.set(up);
          gArmR.set(
            withSequence(
              withTiming(5 * amp, { duration: 180, easing: Easing.out(Easing.cubic) }),
              withDelay(140, withSpring(0, springs.gentle))
            )
          );
          gSquash.set(
            withSequence(
              withTiming(0.03 * amp, { duration: 180, easing: Easing.out(Easing.cubic) }),
              withDelay(140, withSpring(0, springs.gentle))
            )
          );
        }
        run();
      }, first ? 2200 + Math.random() * 2000 : 9000 + Math.random() * 6000);
      first = false;
    };
    run();
    return () => {
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loops]);

  useEffect(() => {
    if (!loops) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      t = setTimeout(() => {
        // Two little drops spin off the crown and vanish. The single clearest "this is water" cue.
        flick.set(withSequence(withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })));
        run();
      }, 5000 + Math.random() * 4000);
    };
    run();
    return () => {
      if (t) clearTimeout(t);
    };
  }, [loops, flick]);

  // ── triggers ────────────────────────────────────────────────────────────
  const lastKey = useRef<number | null>(null);
  useEffect(() => {
    if (!trigger) return;
    if (lastKey.current === trigger.key) return;
    lastKey.current = trigger.key;
    const name = trigger.name;
    const end = () => onTriggerEnd?.(name);

    if (reduce) {
      tBright.set(withSequence(withTiming(0.25, { duration: 150 }), withTiming(0, { duration: 200 })));
      // Limbs hold the mood pose: the trigger layer is simply timed to zero, never sprung.
      tArmL.set(withTiming(0, { duration: 150 }));
      tArmR.set(withTiming(0, { duration: 150 }));
      tLegL.set(withTiming(0, { duration: 150 }));
      tLegR.set(withTiming(0, { duration: 150 }));
      const t = setTimeout(end, 400);
      return () => clearTimeout(t);
    }

    /** Anticipation → air → landing → settle. Never a teleport to the apex. */
    const jump = (height: number) => {
      tHop.set(
        withSequence(
          withTiming(-2.5, { duration: 110, easing: Easing.out(Easing.quad) }),
          withSpring(height, { damping: 9, stiffness: 240 }),
          withSpring(0, { damping: 13, stiffness: 200 })
        )
      );
      tSquash.set(
        withSequence(
          withTiming(0.14, { duration: 110, easing: Easing.out(Easing.quad) }),
          withTiming(-0.02, { duration: 160, easing: Easing.out(Easing.cubic) }),
          withDelay(90, withTiming(0.12, { duration: 90, easing: Easing.in(Easing.quad) })),
          withSpring(0, springs.bouncy)
        )
      );
    };

    /** Arms swing back on the crouch, lead the body into the air, then bounce past on the landing —
     *  anticipation, then follow-through. The landing value is deliberately *past* rest. */
    const armSwing = (back: number, up: number, settle: number, antic = 110) =>
      withSequence(
        withTiming(back, { duration: antic, easing: Easing.out(Easing.quad) }),
        withSpring(up, { damping: 10, stiffness: 240 }),
        withSpring(settle, { damping: 13, stiffness: 210 }),
        withSpring(0, { damping: 14, stiffness: 150 })
      );
    /** Knees bend on the crouch, tuck outward in the air, then take the landing. */
    const legTuck = (bend: number, tuck: number, antic = 110) =>
      withSequence(
        withTiming(bend, { duration: antic, easing: Easing.out(Easing.quad) }),
        withSpring(tuck, { damping: 10, stiffness: 250 }),
        withSpring(bend * 0.6, { damping: 13, stiffness: 220 }),
        withSpring(0, springs.bouncy)
      );

    let ms = 700;
    switch (name) {
      case "mealLogged":
        jump(16);
        // Up on the hop, then both hands sweep *in* on the landing — the belly pat.
        tArmL.set(armSwing(-8, 40, -20));
        tArmR.set(armSwing(-8, 40, -20));
        tLegL.set(legTuck(-5, 9));
        tLegR.set(legTuck(-5, 9));
        ms = 950;
        break;
      case "goalHit":
        jump(28);
        tLean.set(withSequence(withSpring(-4, springs.bouncy), withSpring(0, springs.bouncy)));
        // The big one: arms wind back through the crouch, fly to full stretch, bounce on landing.
        tArmL.set(
          withSequence(
            withTiming(-25, { duration: 110, easing: Easing.out(Easing.quad) }),
            withSpring(135, { damping: 11, stiffness: 230 }),
            withSpring(101, { damping: 12, stiffness: 200 }),
            withSpring(124, { damping: 16, stiffness: 220 }),
            withSpring(0, { damping: 14, stiffness: 120 })
          )
        );
        tArmR.set(
          withSequence(
            withTiming(-25, { duration: 110, easing: Easing.out(Easing.quad) }),
            withSpring(135, { damping: 11, stiffness: 230 }),
            withSpring(101, { damping: 12, stiffness: 200 }),
            withSpring(124, { damping: 16, stiffness: 220 }),
            withSpring(0, { damping: 14, stiffness: 120 })
          )
        );
        tLegL.set(legTuck(-8, 25));
        tLegR.set(legTuck(-8, 25));
        ms = 1400;
        break;
      case "streakUp":
        jump(20);
        tHop.set(
          withSequence(
            withTiming(-2.5, { duration: 100, easing: Easing.out(Easing.quad) }),
            withSpring(20, { damping: 9, stiffness: 260 }),
            withSpring(2, { damping: 16, stiffness: 260 }),
            withSpring(15, { damping: 10, stiffness: 240 }),
            withSpring(0, { damping: 13, stiffness: 200 })
          )
        );
        // One fist punches the air on each hop; the other arm only counter-balances.
        tArmR.set(
          withSequence(
            withTiming(-10, { duration: 100, easing: Easing.out(Easing.quad) }),
            withSpring(135, { damping: 11, stiffness: 300 }),
            withSpring(35, { damping: 14, stiffness: 240 }),
            withSpring(135, { damping: 11, stiffness: 300 }),
            withSpring(0, { damping: 14, stiffness: 150 })
          )
        );
        tArmL.set(
          withSequence(
            withTiming(-6, { duration: 100, easing: Easing.out(Easing.quad) }),
            withSpring(20, { damping: 12, stiffness: 220 }),
            withSpring(4, { damping: 14, stiffness: 200 }),
            withSpring(18, { damping: 12, stiffness: 220 }),
            withSpring(0, { damping: 14, stiffness: 150 })
          )
        );
        tLegL.set(legTuck(-5, 12, 100));
        tLegR.set(legTuck(-5, 12, 100));
        ms = 1400;
        break;
      case "missedDay":
        // Sinks, then picks itself back up. Never a punishment.
        tSquash.set(withSequence(withSpring(0.09, springs.gentle), withDelay(1100, withSpring(0, springs.gentle))));
        // Everything sags at once and comes back on a much softer spring than it went down on.
        tArmL.set(withSequence(withSpring(-17, { damping: 16, stiffness: 95 }), withDelay(1100, withSpring(0, { damping: 18, stiffness: 45 }))));
        tArmR.set(withSequence(withSpring(-17, { damping: 16, stiffness: 95 }), withDelay(1100, withSpring(0, { damping: 18, stiffness: 45 }))));
        tLegL.set(withSequence(withSpring(-9, { damping: 16, stiffness: 95 }), withDelay(1100, withSpring(0, { damping: 18, stiffness: 45 }))));
        tLegR.set(withSequence(withSpring(-9, { damping: 16, stiffness: 95 }), withDelay(1100, withSpring(0, { damping: 18, stiffness: 45 }))));
        tBright.set(withSequence(withTiming(-0.15, { duration: 300 }), withDelay(900, withTiming(0, { duration: 320 }))));
        ms = 2400;
        break;
      case "overTarget":
        tLean.set(withSequence(withSpring(4, { damping: 11, stiffness: 160 }), withDelay(600, withSpring(0, springs.gentle))));
        tHop.set(withSequence(withSpring(-2, { damping: 12, stiffness: 200 }), withDelay(500, withSpring(0, springs.gentle))));
        // A shuffling step back: the legs alternate twice while the arms come up defensively.
        tLegL.set(
          withSequence(
            withSpring(11, { damping: 12, stiffness: 270 }),
            withSpring(-11, { damping: 12, stiffness: 270 }),
            withSpring(11, { damping: 12, stiffness: 270 }),
            withSpring(0, springs.bouncy)
          )
        );
        tLegR.set(
          withSequence(
            withSpring(-11, { damping: 12, stiffness: 270 }),
            withSpring(11, { damping: 12, stiffness: 270 }),
            withSpring(-11, { damping: 12, stiffness: 270 }),
            withSpring(0, springs.bouncy)
          )
        );
        tArmL.set(withSequence(withSpring(24, { damping: 13, stiffness: 210 }), withDelay(450, withSpring(0, springs.gentle))));
        tArmR.set(withSequence(withSpring(24, { damping: 13, stiffness: 210 }), withDelay(450, withSpring(0, springs.gentle))));
        ms = 1300;
        break;
      case "waterLogged":
        tSquash.set(
          withSequence(
            withTiming(0.12, { duration: 110, easing: Easing.out(Easing.quad) }),
            withTiming(-0.16, { duration: 220, easing: Easing.out(Easing.cubic) }),
            withSpring(0, springs.bouncy)
          )
        );
        tHop.set(withSequence(withSpring(12, { damping: 10, stiffness: 220 }), withSpring(0, { damping: 14, stiffness: 200 })));
        tBright.set(withSequence(withTiming(0.3, { duration: 200 }), withTiming(0, { duration: 420 })));
        flick.set(withSequence(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })));
        // Stretch both arms overhead, then shake the droplets off: ±12° at ~8 Hz for 400 ms.
        // Both arms shake the same way (in phase) but the right one starts ~60 ms late, so the
        // stretch reads as one body reaching up rather than two arms bolted to the same pole.
        tArmL.set(withSequence(...shake(100, 6, 1, 0), withSpring(0, { damping: 14, stiffness: 140 })));
        tArmR.set(withSequence(...shake(100, 6, 1, 60), withSpring(0, { damping: 14, stiffness: 140 })));
        tLegL.set(withSequence(withSpring(4, { damping: 13, stiffness: 220 }), withDelay(400, withSpring(0, springs.gentle))));
        tLegR.set(withSequence(withSpring(4, { damping: 13, stiffness: 220 }), withDelay(400, withSpring(0, springs.gentle))));
        ms = 1400;
        break;
      case "tap":
        tSquash.set(withSequence(withTiming(0.14, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(0, springs.bouncy)));
        tSquint.set(withSequence(withTiming(0.45, { duration: 90 }), withDelay(90, withTiming(0, { duration: 180 }))));
        // Everything flails out on the pop and springs back — the juice must return to rest.
        tArmL.set(withSequence(withTiming(46, { duration: 70, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 9, stiffness: 170 })));
        tArmR.set(withSequence(withTiming(46, { duration: 70, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 9, stiffness: 170 })));
        tLegL.set(withSequence(withTiming(14, { duration: 70, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 9, stiffness: 170 })));
        tLegR.set(withSequence(withTiming(14, { duration: 70, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 9, stiffness: 170 })));
        ms = 560;
        break;
    }
    const t = setTimeout(end, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger?.key, reduce]);

  // ── derived: the numbers the renderer actually eats ─────────────────────
  const leanTotal = useDerivedValue(() => {
    "worklet";
    const v = lean.get() + microLean.get() + tLean.get() + wshift.get() * 1.5;
    return Number.isFinite(v) ? Math.max(-22, Math.min(22, v)) : 0;
  });

  // Follow-through: the tip is a soft spring chasing the body, so a sudden lean leaves it behind,
  // it swings past on the way back, and only then settles. One frame of lag, physically.
  useAnimatedReaction(
    () => leanTotal.get(),
    (v) => {
      "worklet";
      tipLag.set(withSpring(v, { damping: 8, stiffness: 90, mass: 1 }));
      // The arms get their own, looser chaser: ~80 ms behind the body with a 30–40 % overshoot,
      // so a lean or a hop leaves them trailing and they swing past before they settle.
      armLag.set(withSpring(v, { damping: 7, stiffness: 130, mass: 0.9 }));
    }
  );

  const hopTotal = useDerivedValue(() => {
    "worklet";
    const v = hop.get() + tHop.get();
    return Number.isFinite(v) ? v : 0;
  });

  // Same trick for height: the arms lag the hop, so they swing out on the way up and tuck in on
  // the landing instead of being welded to the body.
  useAnimatedReaction(
    () => hopTotal.get(),
    (v) => {
      "worklet";
      hopLag.set(withSpring(v, { damping: 8, stiffness: 150, mass: 0.9 }));
    }
  );
  const squashTotal = useDerivedValue(() => {
    "worklet";
    const v = squash.get() + breath.get() + tSquash.get() + gSquash.get();
    return Number.isFinite(v) ? v : 0;
  });
  const hydroScale = useDerivedValue(() => {
    "worklet";
    const h = Math.max(0, Math.min(1, hydra.get()));
    return 0.92 + h * 0.08;
  });
  const brightTotal = useDerivedValue(() => {
    "worklet";
    const h = Math.max(0, Math.min(1, hydra.get()));
    const v = brightness.get() * (0.55 + 0.45 * h) + tBright.get();
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.6;
  });

  const bodyP = useDerivedValue(() => {
    "worklet";
    // Hydration also sags the tip: a thirsty droplet does not stand up straight.
    const h = Math.max(0, Math.min(1, hydra.get()));
    const bendLag = (tipLag.get() - leanTotal.get()) * 0.035;
    const bend = tipBend.get() + bendLag - (1 - h) * 0.55;
    const len = tipLength.get() - (1 - h) * 0.12;
    // A path *string*: `Path` parses it itself, which keeps the Skia API out of the worklet. On
    // web `Skia` is bound when its module is first evaluated, and a worklet closure that captured
    // it would be holding the pre-CanvasKit value.
    return bodyPath(bend, len, hydroScale.get());
  });

  const bodyTransform = useDerivedValue(() => {
    "worklet";
    const s = volumePreservingScale(squashTotal.get());
    return [
      { translateY: -hopTotal.get() },
      { rotate: (leanTotal.get() * Math.PI) / 180 },
      { scaleX: Number.isFinite(s.scaleX) ? s.scaleX : 1 },
      { scaleY: Number.isFinite(s.scaleY) ? s.scaleY : 1 },
    ];
  });
  // Lean pivots at the soles now that the character stands on feet, not at the body's underside.
  const bodyOrigin = { x: BODY.cx, y: FOOT_Y };
  /**
   * Every limb angle is four layers summed on the UI thread: the mood pose, the idle weight shift,
   * whatever micro-gesture or trigger is currently running, and the follow-through lag.
   *
   * `lagSwing` is signed in *world* terms (clockwise positive), so it is added to the left arm and
   * subtracted from the right — the renderer mirrors the right-hand pair. `lagLift` is symmetric:
   * both arms swing outward together on the way up and tuck in on the landing.
   */
  const limbLag = useDerivedValue(() => {
    "worklet";
    const swing = (armLag.get() - leanTotal.get()) * 0.9;
    const lift = (hopTotal.get() - hopLag.get()) * 0.55;
    return {
      swing: Number.isFinite(swing) ? Math.max(-10, Math.min(10, swing)) : 0,
      lift: Number.isFinite(lift) ? Math.max(-10, Math.min(10, lift)) : 0,
    };
  });

  const armLT = useDerivedValue(() => {
    "worklet";
    const l = limbLag.get();
    const v = clampParam("armL", armLv.get() + wshift.get() * -4.5 + breath.get() * 60 + gArmL.get() + tArmL.get() + l.swing + l.lift);
    const r = shoulderRide(v);
    // Translate first, then rotate about the pivot: the arm swings, and the shoulder it swings
    // from rides out and up with it.
    return [{ translateX: -r.out }, { translateY: -r.up }, { rotate: rad(v) }];
  });
  const armRT = useDerivedValue(() => {
    "worklet";
    const l = limbLag.get();
    const v = clampParam("armR", armRv.get() + wshift.get() * 4.5 + breath.get() * 60 + gArmR.get() + tArmR.get() - l.swing + l.lift);
    const r = shoulderRide(v);
    return [{ translateX: r.out }, { translateY: -r.up }, { rotate: -rad(v) }];
  });
  const legLT = useDerivedValue(() => {
    "worklet";
    const v = legLv.get() + wshift.get() * 3 + breath.get() * 20 + gLegL.get() + tLegL.get();
    return [{ rotate: rad(clampParam("legL", v)) }];
  });
  const legRT = useDerivedValue(() => {
    "worklet";
    const v = legRv.get() + wshift.get() * -3 + breath.get() * 20 + gLegR.get() + tLegR.get();
    return [{ rotate: -rad(clampParam("legR", v)) }];
  });

  const dullOpacity = useDerivedValue(() => {
    "worklet";
    return (1 - brightTotal.get()) * 0.45;
  });
  const glossOpacity = useDerivedValue(() => {
    "worklet";
    return 0.62 + brightTotal.get() * 0.3;
  });
  const shadowTransform = useDerivedValue(() => {
    "worklet";
    const lift = Math.max(0, Math.min(1, hopTotal.get() / 24));
    const sx = 1 - lift * 0.34;
    const sy = 1 - lift * 0.3;
    return [{ scaleX: Number.isFinite(sx) ? sx : 1 }, { scaleY: Number.isFinite(sy) ? sy : 1 }];
  });
  const shadowOpacity = useDerivedValue(() => {
    "worklet";
    const lift = Math.max(0, Math.min(1, hopTotal.get() / 24));
    return 0.25 * (1 - lift * 0.55);
  });

  /** Gaze as a translation the whole iris group rides — one derived value instead of six. */
  const pupilTransform = useDerivedValue(() => {
    "worklet";
    const g = clampGaze(
      (gazeX.get() + moodLookX.get()) * GAZE_RADIUS + sacX.get(),
      (gazeY.get() + moodLookY.get()) * GAZE_RADIUS + sacY.get(),
      GAZE_RADIUS
    );
    return [{ translateX: Number.isFinite(g.x) ? g.x : 0 }, { translateY: Number.isFinite(g.y) ? g.y : 0 }];
  });

  const lidDrop = useDerivedValue(() => {
    "worklet";
    const open = Math.max(0, Math.min(1, eyeOpen.get() * blink.get()));
    const v = (1 - open) * (EYE_L.ry * 2 + 4);
    return Number.isFinite(v) ? v : 0;
  });
  /** Lids are oversized ovals sliding in from outside the eye, clipped to it. */
  const lidTopTransform = useDerivedValue(() => {
    "worklet";
    return [{ translateY: lidDrop.get() }];
  });
  const lidBottomTransform = useDerivedValue(() => {
    "worklet";
    const squint = Math.max(0, Math.min(1, eyeSquint.get() + tSquint.get()));
    return [{ translateY: -(Number.isFinite(squint) ? squint : 0) * 18 }];
  });

  const mouthP = useDerivedValue(() => {
    "worklet";
    return mouthPath({ halfWidth: mouthWidth.get(), open: mouthOpen.get(), curve: mouthCurve.get() });
  });
  /** Top and floor of the opening, so the teeth and the tongue are placed off real geometry. */
  const lipY = useDerivedValue(() => {
    "worklet";
    return mouthLipY(mouthWidth.get(), mouthCurve.get());
  });
  const openingH = useDerivedValue(() => {
    "worklet";
    return Math.max(0.5, mouthFloorY(mouthOpen.get()) - lipY.get());
  });
  /**
   * The teeth are a thin upper row — about 30% of the opening — whose lower edge bulges down in
   * the middle, so the dark interior reaches higher at the corners than it does at the centre.
   */
  const teethBand = useDerivedValue(() => {
    "worklet";
    const h = openingH.get();
    const band = Math.max(2.2, h * 0.42);
    const yMid = lipY.get() + band;
    const ySide = lipY.get() + band * 0.45;
    const w = mouthWidth.get() + 6;
    return `M${-w} -26L${w} -26L${w} ${ySide}L${w * 0.5} ${ySide}Q0 ${yMid} ${-w * 0.5} ${ySide}L${-w} ${ySide}Z`;
  });
  /** A soft dome sitting in the lower third of the opening; the mouth clip takes its underside. */
  const tongueP = useDerivedValue(() => {
    "worklet";
    const h = openingH.get();
    const top = lipY.get() + h * 0.52;
    const ry = Math.max(3, h * 0.62);
    return ellipsePath(0, top + ry, mouthWidth.get() * 0.82, ry);
  });

  /*
   * Positive `browAngle` lifts the INNER ends — the classic sad/worried brow. The naive sign does
   * the opposite and turns every worried face into an angry one, which is the single fastest way
   * to make a friendly character read as hostile.
   */
  /*
   * Positive `browAngle` lifts the INNER ends — the classic sad/worried brow. The naive sign does
   * the opposite and turns every worried face into an angry one, which is the single fastest way
   * to make a friendly character read as hostile. The traced resting tilt of each brow is baked in
   * underneath, so the pose only ever adds to it.
   */
  const browRotL = useDerivedValue(() => {
    "worklet";
    return [{ translateY: browYv.get() }, { rotate: ((BROW_TILT_L - browAngle.get()) * Math.PI) / 180 }];
  });
  const browRotR = useDerivedValue(() => {
    "worklet";
    return [{ translateY: browYv.get() }, { rotate: ((BROW_TILT_R + browAngle.get()) * Math.PI) / 180 }];
  });
  /** Lids shut: how far down the lash line has travelled, capped at the eye centre. */
  const lashTransform = useDerivedValue(() => {
    "worklet";
    return [{ translateY: Math.min(lidDrop.get(), EYE_L.ry + 2) }];
  });
  const lashOpacity = useDerivedValue(() => {
    "worklet";
    const open = Math.max(0, Math.min(1, eyeOpen.get() * blink.get()));
    return 1 - open;
  });

  const blushOpacity = useDerivedValue(() => {
    "worklet";
    return Math.max(0, Math.min(1, blush.get()));
  });

  const tipTransform = useDerivedValue(() => {
    "worklet";
    const a = tipAnchor(tipBend.get(), tipLength.get(), hydroScale.get());
    return [{ translateX: Number.isFinite(a.x) ? a.x : BODY.cx }, { translateY: Number.isFinite(a.y) ? a.y : 30 }];
  });

  /** The flicks travel out from the apex and fade; two of them, offset in time. */
  const flickA = useDerivedValue(() => {
    "worklet";
    const t = Math.max(0, Math.min(1, flick.get()));
    return [{ translateX: FLICKS[0].dx * t }, { translateY: FLICKS[0].dy * t }, { scale: 0.5 + t * 0.6 }];
  });
  const flickB = useDerivedValue(() => {
    "worklet";
    const t = Math.max(0, Math.min(1, Math.max(0, flick.get() - 0.18) / 0.82));
    return [{ translateX: FLICKS[1].dx * t }, { translateY: FLICKS[1].dy * t }, { scale: 0.4 + t * 0.6 }];
  });
  const flickAOpacity = useDerivedValue(() => {
    "worklet";
    const t = Math.max(0, Math.min(1, flick.get()));
    return t === 0 ? 0 : Math.min(1, t * 5) * (1 - t) * 1.6;
  });
  const flickBOpacity = useDerivedValue(() => {
    "worklet";
    const t = Math.max(0, Math.min(1, Math.max(0, flick.get() - 0.18) / 0.82));
    return t === 0 ? 0 : Math.min(1, t * 5) * (1 - t) * 1.6;
  });

  /** An ellipse as a path string — `clip` takes a path definition, so no Skia object is needed. */
  const eyeClipL = useMemo(() => ellipsePath(EYE_L.x, EYE_L.y, EYE_L.rx, EYE_L.ry), []);
  const eyeClipR = useMemo(() => ellipsePath(EYE_R.x, EYE_R.y, EYE_R.rx, EYE_R.ry), []);
  /**
   * Every eye is three lines and nothing else: a thin rim all the way round, a heavy upper-lid
   * arc over the top two thirds, and a soft shadow the lid casts onto the white. The two eyes get
   * the SAME angular spans, mirrored — the old build gave the left eye one tail arc and the right
   * eye two, which is what made the pair look hand-patched rather than drawn.
   */
  const eyeRimL = useMemo(() => ellipsePath(EYE_L.x, EYE_L.y, EYE_L.rx - 0.7, EYE_L.ry - 0.7), []);
  const eyeRimR = useMemo(() => ellipsePath(EYE_R.x, EYE_R.y, EYE_R.rx - 0.7, EYE_R.ry - 0.7), []);
  const lidArcL = useMemo(() => arcPath(EYE_L.x, EYE_L.y, EYE_L.rx - 0.7, EYE_L.ry - 0.7, 164, 326), []);
  const lidArcR = useMemo(() => arcPath(EYE_R.x, EYE_R.y, EYE_R.rx - 0.7, EYE_R.ry - 0.7, 214, 376), []);
  /** The shadow the lid drops on the white — drawn inside the eye clip, blurred, barely there. */
  const lidShadeL = useMemo(() => arcPath(EYE_L.x, EYE_L.y, EYE_L.rx - 2.3, EYE_L.ry - 2.3, 172, 320), []);
  const lidShadeR = useMemo(() => arcPath(EYE_R.x, EYE_R.y, EYE_R.rx - 2.3, EYE_R.ry - 2.3, 220, 368), []);
  /** Brows are laid out end-to-end from the trace, then drawn around their own midpoint. */
  const brows = useMemo(
    () => ({
      l: { mx: BROW_L.x, my: BROW_L.y, path: browPath(BROW_L.half, 5.5, 11, 2.8) },
      r: { mx: BROW_R.x, my: BROW_R.y, path: browPath(BROW_R.half, 5.5, 11, 2.8) },
    }),
    []
  );
  const flickShapeA = useMemo(() => flickPath(FLICKS[0].size), []);
  const flickShapeB = useMemo(() => flickPath(FLICKS[1].size), []);
  // Hugs the right contour of the tip, about 6 units inside the edge.
  const glossStreak = useMemo(() => capsulePath(90, 58, 118, 96, 6), []);
  /** A disc parked far to the lower left: only its right arc crosses the body, and that arc is
   *  the terminator. Blurred wide, it becomes a soft band rather than a seam. */
  /** The main shade is a band across the BOTTOM — measuring the reference, the left half is not
   *  darker; what reads as a dark left edge is just the contour. */
  /** Measured off the reference: the terminator is CONCENTRIC with the base circle — the shade
   *  is the ring from r≈40 out to the contour, across the bottom half only. A stroked arc of
   *  radius 51 and width 22 is exactly that ring, and it fades at its own ends. */
  const shadeZone = useMemo(() => "M49 158A51 51 0 0 0 151 158", []);

  const scale = useMemo(() => [{ scale: k }], [k]);

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={`Floo, ${MOOD_LABEL_TR[mood]}`}
      style={[{ width, height }, style]}
      pointerEvents="none"
    >
      <Canvas style={{ width, height }}>
        <Group transform={scale}>
          {/* contact shadow — drawn first, so the body lands on it */}
          <Group transform={shadowTransform} origin={{ x: SHADOW.x, y: SHADOW.y }}>
            <Oval
              x={SHADOW.x - SHADOW.rx}
              y={SHADOW.y - SHADOW.ry}
              width={SHADOW.rx * 2}
              height={SHADOW.ry * 2}
              color={C.shadow}
              opacity={shadowOpacity}
            >
              <Blur blur={3.5} />
            </Oval>
          </Group>

          <Group transform={bodyTransform} origin={bodyOrigin}>
            {/* flying flicks — behind the body, so they read as spinning off the far side */}
            <Group transform={tipTransform}>
              <Group transform={flickA} opacity={flickAOpacity}>
                <Path path={flickShapeA} color={C.bodyLight} />
                <Path path={flickShapeA} color={C.outline} style="stroke" strokeWidth={2} />
              </Group>
              <Group transform={flickB} opacity={flickBOpacity}>
                <Path path={flickShapeB} color={C.bodyLight} />
                <Path path={flickShapeB} color={C.outline} style="stroke" strokeWidth={1.8} />
              </Group>
            </Group>

            {/* All four limbs are traced outlines drawn BEHIND the body, and clipped to the
                OUTSIDE of it: the trace includes slivers that hug the body edge, and without the
                inverted clip their contour runs parallel to the body's own, doubling it. */}

            <Group transform={legLT} origin={PIVOT_LEG_L}>
              <Group clip={LIMB_CLIP}>
                <Path path={LEG_PATH_L} color={C.bodyMid} />
                <Group clip={SHOE_CLIP}>
                  <Path path={LEG_PATH_L} color={C.shoe} />
                </Group>
                <Group clip={LEG_PATH_L}>
                  <Path path={LEG_RIM_L} color={C.limbRim} />
                  <Path path={LEG_CREASE_L} color={C.limbCrease} />
                </Group>
              </Group>
            </Group>
            <Group transform={legRT} origin={PIVOT_LEG_R}>
              <Group clip={LIMB_CLIP}>
                <Path path={LEG_PATH_R} color={C.bodyMid} />
                <Group clip={SHOE_CLIP}>
                  <Path path={LEG_PATH_R} color={C.shoe} />
                </Group>
                <Group clip={LEG_PATH_R}>
                  <Path path={LEG_RIM_R} color={C.limbRim} />
                  <Path path={LEG_CREASE_R} color={C.limbCrease} />
                </Group>
              </Group>
            </Group>
            {/* Limb contours after all limb fills, so one limb's fill never covers another's
                line. The trace keeps ≥4 units clear of the body and tucks the attachment under
                it, so nothing here needs clipping against the body. */}
            <Group>
              <Group>
                <Group transform={legLT} origin={PIVOT_LEG_L}>
                  <Group clip={LIMB_CLIP}>
                    <Group clip={LEG_PATH_L}>
                      <Path path={LEG_PATH_L} color={C.outline} style="stroke" strokeWidth={OUTLINE_W * 2} strokeJoin="round" />
                    </Group>
                  </Group>
                </Group>
                <Group transform={legRT} origin={PIVOT_LEG_R}>
                  <Group clip={LIMB_CLIP}>
                    <Group clip={LEG_PATH_R}>
                      <Path path={LEG_PATH_R} color={C.outline} style="stroke" strokeWidth={OUTLINE_W * 2} strokeJoin="round" />
                    </Group>
                  </Group>
                </Group>
              </Group>
            </Group>

            <Path path={bodyP} color={C.bodyFill} />
            <Group clip={bodyP}>
              {/* The main shade: a soft band across the bottom, from y ≈ 180 down. */}
              <Path path={shadeZone} color={C.bodyShade} style="stroke" strokeWidth={23} strokeCap="round" opacity={0.95}>
                <Blur blur={4} />
              </Path>
              {/* Rim shades down both sides of the lower half — an inner stroke, clipped to the
                  half it belongs to, which is cheaper and softer than fitting two more discs. */}
              <Path path={RIM_ARC_LEFT} color={C.rimLeft} style="stroke" strokeWidth={20} strokeCap="round" opacity={0.75}>
                <Blur blur={7} />
              </Path>
              <Path path={RIM_ARC_RIGHT} color={C.rimRight} style="stroke" strokeWidth={20} strokeCap="round" opacity={0.75}>
                <Blur blur={7} />
              </Path>
              {/* thirst: a flat grey wash that drains the colour */}
              <Rect x={0} y={0} width={200} height={240} color={C.dull} opacity={dullOpacity} />
              {/* The only three highlights on the body. Anything more reads as bubbles. */}
              <Group opacity={glossOpacity}>
                <Path path={glossStreak} color={C.gloss} opacity={0.9}>
                  <Blur blur={1.6} />
                </Path>
                <Oval x={117} y={90} width={6} height={10} color={C.gloss} />
                <Oval x={73} y={205} width={16} height={7} color={C.gloss} opacity={0.7} />
                <Oval x={132} y={187} width={17} height={8} color={C.gloss} opacity={0.75} />
              </Group>
            </Group>
            {/* thick cartoon contour, last so nothing paints over it. Clipped to the body so it
                reads as an INNER stroke: the traced contour IS the reference's outer silhouette,
                and a centred stroke would push the whole character ~1.2 units wider all round. */}
            <Group clip={bodyP}>
              <Path path={bodyP} color={C.outline} style="stroke" strokeWidth={OUTLINE_W * 2} strokeJoin="round" />
            </Group>

            {/* The LEFT arm is drawn IN FRONT of the body — measured off the reference, where the body's
                lower-left/right contour is interrupted by the arm at the shoulder rather than
                running over it. Legs stay behind, which is what the reference does there. */}
            {/* BOTH arms draw IN FRONT of the body. The reference has the right arm behind, but
                behind-the-body only works for a hanging arm: raised to ~150° the whole limb
                vanishes into the silhouette and all that survives is a row of fingertip spikes at
                the contour. Drawing it in front costs a hair of the resting armpit line and buys a
                raised arm that is actually visible. Each arm's contour is the OPEN `ARM_LINE_*`,
                which stops short of the root edge, so no cap line is painted across the body. */}
            <Group transform={armRT} origin={PIVOT_ARM_R}>
              <Group clip={LIMB_CLIP}>
                <Path path={ARM_PATH_R} color={C.bodyMid} />
                <Group clip={ARM_PATH_R}>
                  <Oval x={146} y={176} width={14} height={62} color={C.armShade} opacity={0.28}>
                    <Blur blur={7} />
                  </Oval>
                  <Path path={ARM_RIM_R} color={C.limbRim} />
                  <Path path={ARM_CREASE_R} color={C.limbCrease} />
                </Group>
              </Group>
            </Group>
            <Group transform={armRT} origin={PIVOT_ARM_R}>
              <Group clip={LIMB_CLIP}>
                <Group clip={ARM_PATH_R}>
                  <Path path={ARM_LINE_R} color={C.outline} style="stroke" strokeWidth={OUTLINE_W * 2} strokeJoin="round" strokeCap="round" />
                </Group>
              </Group>
            </Group>
            <Group transform={armLT} origin={PIVOT_ARM_L}>
              <Group clip={LIMB_CLIP}>
                <Path path={ARM_PATH_L} color={C.bodyMid} />
                <Group clip={ARM_PATH_L}>
                  {/* One soft shade hugging the inner edge only. Measured off the reference the
                      forearm is otherwise a flat #6EC1E8 — the old pair of blurred ovals pulled
                      the whole limb ~11 levels too dark. */}
                  <Oval x={40} y={176} width={14} height={62} color={C.armShade} opacity={0.28}>
                    <Blur blur={7} />
                  </Oval>
                  <Path path={ARM_RIM_L} color={C.limbRim} />
                  <Path path={ARM_CREASE_L} color={C.limbCrease} />
                </Group>
              </Group>
            </Group>
            <Group transform={armLT} origin={PIVOT_ARM_L}>
              <Group clip={LIMB_CLIP}>
                <Group clip={ARM_PATH_L}>
                  <Path path={ARM_LINE_L} color={C.outline} style="stroke" strokeWidth={OUTLINE_W * 2} strokeJoin="round" strokeCap="round" />
                </Group>
              </Group>
            </Group>

            {/* blush */}
            {/* blush — a soft-edged oval. A hard ellipse on a rounded body reads as a sticker. */}
            <Group opacity={blushOpacity}>
              <Oval x={CHEEK.left.x - CHEEK.left.rx} y={CHEEK.left.y - CHEEK.left.ry} width={CHEEK.left.rx * 2} height={CHEEK.left.ry * 2} color={C.blush}>
                <Blur blur={3.2} />
              </Oval>
              <Oval x={CHEEK.right.x - CHEEK.right.rx} y={CHEEK.right.y - CHEEK.right.ry} width={CHEEK.right.rx * 2} height={CHEEK.right.ry * 2} color={C.blush}>
                <Blur blur={3.2} />
              </Oval>
            </Group>

            {/* brows */}
            <Group transform={[{ translateX: brows.l.mx }, { translateY: brows.l.my }]}>
              <Group transform={browRotL}>
                <Path path={brows.l.path} color={C.brow} />
              </Group>
            </Group>
            <Group transform={[{ translateX: brows.r.mx }, { translateY: brows.r.my }]}>
              <Group transform={browRotR}>
                <Path path={brows.r.path} color={C.brow} />
              </Group>
            </Group>

            {/* eyes */}
            <Group>
              <Group clip={eyeClipL}>
                <Oval x={EYE_L.x - EYE_L.rx} y={EYE_L.y - EYE_L.ry} width={EYE_L.rx * 2} height={EYE_L.ry * 2} color={C.eyeWhite} />
                <Path path={lidShadeL} color={C.lidDark} style="stroke" strokeWidth={3.4} strokeCap="round" opacity={0.16}>
                  <Blur blur={2.2} />
                </Path>
                <Group transform={pupilTransform}>
                  <Circle cx={IRIS_L.x} cy={IRIS_L.y} r={IRIS_R} color={C.eye} />
                  <Circle cx={IRIS_L.x + GLINT.bigX} cy={IRIS_L.y + GLINT.bigY} r={GLINT.bigR} color={C.highlight} />
                  <Circle cx={IRIS_L.x + GLINT.smallX} cy={IRIS_L.y + GLINT.smallY} r={GLINT.smallR} color={C.highlight} opacity={0.85} />
                </Group>
                <Group transform={lidTopTransform}>
                  <Oval x={EYE_L.x - LID_RX} y={EYE_L.y - EYE_L.ry - LID_RY * 2} width={LID_RX * 2} height={LID_RY * 2} color={LID_COLOR} />
                </Group>
                <Group transform={lidBottomTransform}>
                  <Oval x={EYE_L.x - LID_RX} y={EYE_L.y + EYE_L.ry} width={LID_RX * 2} height={LID_RY * 2} color={LID_COLOR} />
                  <Oval x={EYE_L.x - LID_RX} y={EYE_L.y + EYE_L.ry} width={LID_RX * 2} height={LID_RY * 2} color={C.lidDark} style="stroke" strokeWidth={FACE_W.rim} />
                </Group>
                {/* A shut eye is a lash line, not a blue disc. */}
                <Group transform={lashTransform} opacity={lashOpacity}>
                  <Path
                    path={`M${EYE_L.x - 11} ${EYE_L.y - EYE_L.ry}Q${EYE_L.x} ${EYE_L.y - EYE_L.ry + 6} ${EYE_L.x + 11} ${EYE_L.y - EYE_L.ry}`}
                    color={C.brow}
                    style="stroke"
                    strokeWidth={2.6}
                    strokeCap="round"
                  />
                </Group>
              </Group>
              <Path path={eyeRimL} color={C.lidDark} style="stroke" strokeWidth={FACE_W.rim} />
              <Path path={lidArcL} color={C.lidDark} style="stroke" strokeWidth={FACE_W.lid} strokeCap="round" />
            </Group>
            <Group>
              <Group clip={eyeClipR}>
                <Oval x={EYE_R.x - EYE_R.rx} y={EYE_R.y - EYE_R.ry} width={EYE_R.rx * 2} height={EYE_R.ry * 2} color={C.eyeWhite} />
                <Path path={lidShadeR} color={C.lidDark} style="stroke" strokeWidth={3.4} strokeCap="round" opacity={0.16}>
                  <Blur blur={2.2} />
                </Path>
                <Group transform={pupilTransform}>
                  <Circle cx={IRIS_R_C.x} cy={IRIS_R_C.y} r={IRIS_R} color={C.eye} />
                  <Circle cx={IRIS_R_C.x + GLINT.bigX} cy={IRIS_R_C.y + GLINT.bigY} r={GLINT.bigR} color={C.highlight} />
                  <Circle cx={IRIS_R_C.x + GLINT.smallX} cy={IRIS_R_C.y + GLINT.smallY} r={GLINT.smallR} color={C.highlight} opacity={0.85} />
                </Group>
                <Group transform={lidTopTransform}>
                  <Oval x={EYE_R.x - LID_RX} y={EYE_R.y - EYE_R.ry - LID_RY * 2} width={LID_RX * 2} height={LID_RY * 2} color={LID_COLOR} />
                </Group>
                <Group transform={lidBottomTransform}>
                  <Oval x={EYE_R.x - LID_RX} y={EYE_R.y + EYE_R.ry} width={LID_RX * 2} height={LID_RY * 2} color={LID_COLOR} />
                  <Oval x={EYE_R.x - LID_RX} y={EYE_R.y + EYE_R.ry} width={LID_RX * 2} height={LID_RY * 2} color={C.lidDark} style="stroke" strokeWidth={FACE_W.rim} />
                </Group>
                <Group transform={lashTransform} opacity={lashOpacity}>
                  <Path
                    path={`M${EYE_R.x - 11} ${EYE_R.y - EYE_R.ry}Q${EYE_R.x} ${EYE_R.y - EYE_R.ry + 6} ${EYE_R.x + 11} ${EYE_R.y - EYE_R.ry}`}
                    color={C.brow}
                    style="stroke"
                    strokeWidth={2.6}
                    strokeCap="round"
                  />
                </Group>
              </Group>
              <Path path={eyeRimR} color={C.lidDark} style="stroke" strokeWidth={FACE_W.rim} />
              <Path path={lidArcR} color={C.lidDark} style="stroke" strokeWidth={FACE_W.lid} strokeCap="round" />
            </Group>

            {/* mouth: a dark interior with a band of teeth at the top and a tongue below, both
                clipped to the opening, so closing the mouth collapses it to a single curved line */}
            <Group transform={[{ translateX: MOUTH.x }, { translateY: MOUTH.y }]}>
              <Path path={mouthP} color={C.mouth} />
              <Group clip={mouthP}>
                <Path path={teethBand} color={C.teeth} />
                <Path path={tongueP} color={C.tongue} />
              </Group>
              <Path path={mouthP} color={C.mouthLine} style="stroke" strokeWidth={FACE_W.mouth} strokeJoin="round" />
            </Group>
            {/* the little chin dimple under the smile */}
            <Path
              path={`M${CHIN.x - CHIN.half} ${CHIN.y}Q${CHIN.x} ${CHIN.y + 4.5} ${CHIN.x + CHIN.half} ${CHIN.y}`}
              color={C.mouthLine}
              style="stroke"
              strokeWidth={FACE_W.rim}
              strokeCap="round"
              opacity={0.5}
            />

            {/* cosmetic slot, riding the tip */}
            {accessory ? <Group transform={tipTransform}>{accessory}</Group> : null}
          </Group>
        </Group>
      </Canvas>
    </View>
  );
}

export type { SharedValue };
