import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Blur, Canvas, Circle, Group, Oval, Path, Rect } from "@shopify/react-native-skia";
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { springs } from "../../theme/motion";
import {
  BODY,
  BROW_L,
  BROW_R,
  CHEEK,
  CHIN,
  EYE_L,
  FACE_W,
  GLINT,
  EYE_R,
  GAZE_RADIUS,
  FOOT_Y,
  IRIS_L,
  IRIS_R,
  IRIS_R_C,
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
import { FLOO_MODEL_COLORS, FLOO_MODEL_COLORS as C, MOOD_BROW_WEIGHT, MOOD_LABEL_TR, MOOD_PARAMS, type FlooParams, type Mood, type Trigger } from "./params";
import { COMPILED, COMPILED_MIRROR, GESTURE_INDEX, IDLE_GESTURES, MOOD_RIG, REDUCED, gestureDuration, reducedGestureDuration, type Gesture } from "./poses";
import { GestureEndTracker, type GestureEndEvent } from "./gestureEnd";
import { FlooLimbs } from "./FlooLimbs";
import {
  A,
  ARM_BASE,
  CH,
  CHANNEL_COUNT,
  REST,
  SPRING,
  SPRING_REDUCED,
  applyGesture,
  BREATH_AMP,
  BREATH_IN,
  applyWalk,
  loopCurve,
  resolveFront,
  stepSprings,
  trackIkTargets,
  type BodyXform,
} from "./rig";
import { LOD_VIEW, TRIGGER_GESTURE, flooBox, flooTriggerPlan, type FlooLod } from "./behaviour";

const VB = { w: 200, h: 290 } as const;
/** Height : width of the full-body box. Smaller LODs crop it; see `flooBox`. */
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
  /**
   * A one-shot body-language move from the pose library (`poses.ts`), independent of triggers.
   * Change the key to replay; `mirror` plays it with the other hand.
   */
  gesture?: { name: Gesture; key: number; mirror?: boolean } | null;
  /**
   * Called exactly once for every gesture played through `gesture` (once per key): when its
   * timeline completes, or — with `completed: false` — when another gesture or a trigger replaces
   * it first, or when the name is not in the library. Under reduced motion the gesture plays as a
   * short cross-fade to its key pose and back, and this fires when that is done. Gestures a
   * trigger plays report through `onTriggerEnd` instead. Not called after unmount.
   */
  onGestureEnd?: (name: Gesture, info: { key: number; completed: boolean }) => void;
  /**
   * Point at something: a position in this view's own pixels (0,0 = top-left of the box). The
   * nearer hand reaches for it with two-bone IK and holds until this goes back to null.
   */
  pointAt?: { x: number; y: number } | null;
  /** Walk in place (the caller moves the view). Starts and stops through a blended cycle. */
  walking?: boolean;
  /** Level of detail. Defaults from `size`: ≥ 96 full, 56–96 mid, < 56 badge. */
  lod?: FlooLod;
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
  "worklet";
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
}

function blinkDelay() {
  return 2600 + Math.random() * 2600;
}
function saccadeDelay() {
  return 1800 + Math.random() * 2800;
}

const WALK_ID = GESTURE_INDEX.walk;
/**
 * Under Jest the canvas is a stub and a perpetual frame loop would keep fake timers busy forever,
 * so the rig simply holds its rest pose there. Everything the loop computes is unit-tested
 * directly (`__tests__/mascot/rig.test.ts`).
 */
const FRAME_LOOP = !(typeof process !== "undefined" && process.env?.JEST_WORKER_ID);
/** Under Jest the limbs' derived chains only cost time: the canvas they would feed is a stub. */
const MaybeLimbs: typeof FlooLimbs = FRAME_LOOP ? FlooLimbs : ({ children }) => <>{children}</>;
/** Chosen once per process, so it is the same hook on every render. */
const useRigLoop: typeof useFrameCallback = FRAME_LOOP ? useFrameCallback : ((() => ({ setActive: () => {}, isActive: false, callbackId: -1 })) as unknown as typeof useFrameCallback);

function leanDelay() {
  return 9000 + Math.random() * 6000;
}
/** Idle fidgets are rare: the first one after 12–20 s on screen, then one every 25–45 s. */
function fidgetDelay(first: boolean) {
  return first ? 12000 + Math.random() * 8000 : 25000 + Math.random() * 20000;
}
/** Idle fidgets play at this fraction of the gesture: a hint of the move, never a performance. */
const FIDGET_WEIGHT = 0.55;

/**
 * Floo 3 — the droplet, now with a skeleton.
 *
 * The body and face are one closed path plus a handful of shapes driven by seventeen numbers: an
 * area-preserving breath, a blink that is never on a metronome, saccades on their own schedule, a
 * tip that lags the body and overshoots before it settles, and hops that crouch first.
 *
 * The limbs are a rig (`rig.ts`): two-bone arms and legs drawn as rubber-hose tubes with mitten
 * hands and boots, posed by a mood, a gesture timeline, the idle layer, a walk cycle and IK, then
 * chased by one per-joint spring layer that runs in a frame callback on the UI thread. The legs are
 * planted: the body crouches and they bend; it hops and they leave the ground.
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
  gesture = null,
  onGestureEnd,
  pointAt = null,
  walking = false,
  lod: lodProp,
  accessory,
  animate = true,
  style,
  testID,
}: FlooModelProps) {
  const reduce = useReducedMotion();
  const loops = animate && !reduce;
  const box = flooBox(size, lodProp);
  const lod = box.lod;
  const view = LOD_VIEW[lod];
  const width = box.width;
  const height = box.height;
  const k = width / view.w;

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

  // ── idle layer (additive, always underneath) ────────────────────────────
  const breath = useSharedValue(0);
  const blink = useSharedValue(1);
  const microLean = useSharedValue(0);
  const sacX = useSharedValue(0);
  const sacY = useSharedValue(0);
  /** −1 … +1, a very slow weight shift. One value drives the lean, the counter-swing of both
   *  arms and the relaxed leg, so they can never drift out of phase with each other. */
  const wshift = useSharedValue(0);

  // ── trigger layer (additive, transient) ─────────────────────────────────
  const tSquash = useSharedValue(0);
  const tHop = useSharedValue(0);
  const tLean = useSharedValue(0);
  const tBright = useSharedValue(0);
  const tSquint = useSharedValue(0);

  // ── rig (the skeleton; see rig.ts) ──────────────────────────────────────
  /** The mood's resting limb pose — the base every gesture starts from and returns to. */
  const moodRig = useSharedValue<number[]>(MOOD_RIG[mood]);
  /** A gesture request from the JS thread; the frame loop notices the key change and starts it. */
  const gestureReq = useSharedValue({ id: -1, key: 0, mirror: false });
  /** An idle fidget, played only while no real gesture is running, at partial weight. */
  const idleReq = useSharedValue({ id: -1, key: 0, mirror: false });
  const pointSV = useSharedValue({ on: 0, x: 0, y: 0 });
  const walkingSV = useSharedValue(walking ? 1 : 0);
  const loopsSV = useSharedValue(loops ? 1 : 0);
  const reduceSV = useSharedValue(reduce ? 1 : 0);
  const [shiftPeriod] = useState(() => 9 + Math.random() * 3);
  /** Spring state, owned by the frame loop. Mutated in place on the UI thread, never observed. */
  const sim = useSharedValue({
    x: REST.slice(),
    v: new Array<number>(CHANNEL_COUNT).fill(0),
    gKey: 0,
    gIdx: -1,
    gMirror: false,
    gStart: 0,
    iKey: 0,
    iIdx: -1,
    iMirror: false,
    iStart: 0,
    walkAmt: 0,
    walkPhase: 0,
    /** Idle loop phases (0…1) and the weight shift's period at tempo 1, s. Breath starts mid-rise
     *  (value 0) and the shift at the centre, so the first frame matches the rest pose. */
    bU: 0.5 / 2.15,
    wU: 0.5 / 2.12,
    wPeriod: shiftPeriod,
    loopAmt: 0,
    primed: false,
    /** The frame's target pose, rebuilt in place every frame (no per-frame allocation). */
    tgt: REST.slice(),
  });
  /** The posed channels, published once per frame for the geometry below. */
  const rig = useSharedValue<number[]>(REST.slice());

  // ── pointer gaze + tip follow-through ───────────────────────────────────
  const gazeX = useSharedValue(0);
  const gazeY = useSharedValue(0);
  const hydra = useSharedValue(hydration);
  const tipLag = useSharedValue(preset.lean);
  /** 0 → 1 once per flick; drives both droplets off the tip. */
  const flick = useSharedValue(0);

  // ── mood transitions ────────────────────────────────────────────────────
  useEffect(() => {
    const p: FlooParams = MOOD_PARAMS[mood];
    // Reduced motion: a cross-fade, eased at both ends — the face over ≈ ¼ s, the body's shape
    // a little slower, so nothing about the silhouette changes in one frame.
    const soft = (v: number) => (reduce ? withTiming(v, { duration: 240, easing: Easing.inOut(Easing.quad) }) : withSpring(v, springs.gentle));
    const body = (v: number) => (reduce ? withTiming(v, { duration: 360, easing: Easing.inOut(Easing.quad) }) : withSpring(v, springs.bouncy));
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
    moodRig.set(MOOD_RIG[mood]);
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
      // Breath and weight shift ease out in the frame loop; these are small enough to drop.
      microLean.set(0);
      blink.set(1);
      sacX.set(0);
      sacY.set(0);
      return;
    }
    // Breath and the weight shift are driven by phase in the frame loop (see there), so a mood
    // change alters their speed without restarting them.
  }, [loops, microLean, blink, sacX, sacY]);

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
        const to = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.7);
        microLean.set(withSequence(withSpring(to, { damping: 14, stiffness: 60 }), withSpring(0, { damping: 16, stiffness: 50 })));
        run();
      }, leanDelay());
    };
    run();
    return () => {
      if (t) clearTimeout(t);
    };
  }, [loops, microLean]);

  // Now and then an idle fidget (see `fidgetDelay`) — scratching the head, a foot tap, looking at
  // a hand, folding the arms, a stretch — picked at random and sometimes mirrored, never on a beat.
  // The frame loop plays it at partial weight and drops it the moment a real gesture starts.
  useEffect(() => {
    if (!loops) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    let first = true;
    const run = () => {
      t = setTimeout(
        () => {
          const name = IDLE_GESTURES[Math.floor(Math.random() * IDLE_GESTURES.length)];
          const prev = idleReq.get();
          idleReq.set({ id: GESTURE_INDEX[name], key: prev.key + 1, mirror: Math.random() < 0.5 });
          run();
        },
        fidgetDelay(first)
      );
      first = false;
    };
    run();
    return () => {
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loops]);

  // ── rig inputs ──────────────────────────────────────────────────────────
  useEffect(() => {
    loopsSV.set(loops ? 1 : 0);
    reduceSV.set(reduce ? 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loops, reduce]);
  useEffect(() => {
    walkingSV.set(walking && !reduce ? 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking, reduce]);
  // ── gesture requests and their ends ─────────────────────────────────────
  /** Request ids handed to the rig. Only the JS thread writes `gestureReq`, so it counts here. */
  const reqCounter = useRef(0);
  const [endTracker] = useState(() => new GestureEndTracker());
  const onGestureEndRef = useRef(onGestureEnd);
  useEffect(() => {
    onGestureEndRef.current = onGestureEnd;
  }, [onGestureEnd]);
  /** False once unmounted: a report still in flight from the UI thread is dropped, not delivered. */
  const mounted = useRef(false);
  const emitGestureEnd = useCallback((e: GestureEndEvent | null) => {
    if (e && mounted.current) onGestureEndRef.current?.(e.name, { key: e.key, completed: e.completed });
  }, []);
  /** The frame loop finished rig request `req` (UI thread → here through runOnJS). */
  const rigGestureDone = useCallback((req: number) => emitGestureEnd(endTracker.complete(req)), [emitGestureEnd, endTracker]);
  /** Jest only (no frame loop): stands in for the rig's report, so the contract is testable. */
  const stubTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const requestRigGesture = (id: number, mirror: boolean): number => {
    reqCounter.current += 1;
    const req = reqCounter.current;
    gestureReq.set({ id, key: req, mirror });
    return req;
  };
  useEffect(() => {
    mounted.current = true;
    const timers = stubTimers.current;
    return () => {
      mounted.current = false;
      timers.forEach(clearTimeout);
      timers.length = 0;
    };
  }, []);

  const lastGestureKey = useRef<number | null>(null);
  useEffect(() => {
    if (!gesture) return;
    if (lastGestureKey.current === gesture.key) return;
    lastGestureKey.current = gesture.key;
    const id = GESTURE_INDEX[gesture.name] ?? -1;
    if (id < 0) {
      // Not in the library: nothing plays (whatever is playing carries on), but the caller still
      // gets its one end.
      onGestureEndRef.current?.(gesture.name, { key: gesture.key, completed: false });
      return;
    }
    const req = requestRigGesture(id, !!gesture.mirror);
    emitGestureEnd(endTracker.start(req, gesture.name, gesture.key));
    if (!FRAME_LOOP) {
      const ms = reduce ? reducedGestureDuration(gesture.name) : gestureDuration(gesture.name);
      stubTimers.current.push(setTimeout(() => rigGestureDone(req), ms));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesture?.key, gesture?.name]);
  useEffect(() => {
    if (!pointAt || !Number.isFinite(pointAt.x) || !Number.isFinite(pointAt.y)) {
      pointSV.set({ on: 0, x: 0, y: 0 });
      return;
    }
    // View pixels → body space, through this LOD's crop.
    pointSV.set({ on: 1, x: pointAt.x / k + view.x, y: pointAt.y / k + view.y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointAt?.x, pointAt?.y, k, view.x, view.y]);

  useEffect(() => {
    if (!loops) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      t = setTimeout(() => {
        // Two little drops spin off the crown and vanish. The single clearest "this is water" cue.
        flick.set(withSequence(withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })));
        run();
      }, 11000 + Math.random() * 8000);
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

    // The limbs' part of every trigger is a gesture from the pose library, started on the UI thread
    // in the same frame as the body's own sequence below. Under reduced motion the rig plays it as
    // a cross-fade to its key pose, so the reaction still reads without any travel.
    const plan = TRIGGER_GESTURE[name];
    if (plan.gesture) {
      requestRigGesture(GESTURE_INDEX[plan.gesture], plan.mirror);
      emitGestureEnd(endTracker.interrupt());
    }

    if (reduce) {
      // No hop, squash or particles: a glow, and for a tap a smiling squint — an acknowledgement
      // that reads without anything travelling. The gesture's key pose cross-fades in the rig.
      const fade = { duration: 200, easing: Easing.inOut(Easing.quad) };
      tBright.set(withSequence(withTiming(0.22, fade), withTiming(0, { duration: 320, easing: Easing.inOut(Easing.quad) })));
      if (name === "tap") tSquint.set(withSequence(withTiming(0.4, fade), withDelay(120, withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) }))));
      const ms = plan.gesture ? reducedGestureDuration(plan.gesture) : 400;
      const t = setTimeout(end, ms);
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

    /** A small bounce — for acknowledgements that should not make a scene. */
    const bob = (height: number) => {
      tHop.set(withSequence(withTiming(-1, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(height, { damping: 10, stiffness: 260 }), withSpring(0, { damping: 14, stiffness: 220 })));
      tSquash.set(withSequence(withTiming(0.06, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(0, springs.bouncy)));
    };

    // The body's share of each beat. Limbs, lean and face come from the trigger's gesture.
    switch (name) {
      case "mealLogged":
        jump(14);
        break;
      case "goalHit":
        jump(28);
        tLean.set(withSequence(withSpring(-4, springs.bouncy), withSpring(0, springs.bouncy)));
        break;
      case "streakUp":
        // Two hops, one per punch of the fist.
        tHop.set(
          withSequence(
            withTiming(-2.5, { duration: 100, easing: Easing.out(Easing.quad) }),
            withSpring(20, { damping: 9, stiffness: 260 }),
            withSpring(2, { damping: 16, stiffness: 260 }),
            withSpring(15, { damping: 10, stiffness: 240 }),
            withSpring(0, { damping: 13, stiffness: 200 })
          )
        );
        tSquash.set(withSequence(withTiming(0.12, { duration: 100, easing: Easing.out(Easing.quad) }), withSpring(0, springs.bouncy)));
        break;
      case "missedDay":
        // The fall itself is the gesture; the colour drains while it sits, and comes back as it gets up.
        tBright.set(withSequence(withTiming(-0.15, { duration: 300 }), withDelay(1000, withTiming(0, { duration: 360 }))));
        break;
      case "waterLogged":
        // Drinks first (the gesture), then glows and shakes a couple of drops off the crown.
        tBright.set(withDelay(700, withSequence(withTiming(0.3, { duration: 220 }), withTiming(0, { duration: 480 }))));
        flick.set(withDelay(900, withSequence(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 }))));
        tSquash.set(withDelay(1050, withSequence(withTiming(0.08, { duration: 100, easing: Easing.out(Easing.quad) }), withSpring(0, springs.bouncy))));
        break;
      case "setCompleted":
        bob(5);
        break;
      case "workoutDone":
        jump(12);
        tBright.set(withSequence(withTiming(0.2, { duration: 200 }), withTiming(0, { duration: 500 })));
        break;
      case "measurementLogged":
      case "greet":
        bob(4);
        break;
      case "volumeWarning":
      case "goalAdjustProposal":
      case "overTarget":
        break;
      case "tap":
        tSquash.set(withSequence(withTiming(0.14, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(0, springs.bouncy)));
        tSquint.set(withSequence(withTiming(0.45, { duration: 90 }), withDelay(90, withTiming(0, { duration: 180 }))));
        break;
    }
    const ms = Math.max(560, flooTriggerPlan(name).durationMs);
    const t = setTimeout(end, ms);
    return () => clearTimeout(t);
    // `reduce` is read, not a dependency: toggling it mid-beat must not clear the end timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger?.key]);

  // ── the frame loop: pose → springs → published rig ──────────────────────
  /*
   * One pass per frame on the UI thread. The target pose is built in layers — the mood's resting
   * pose, the idle breath and weight shift, an idle fidget or a real gesture, the walk cycle, and a
   * pointing target — and every channel then chases its target on its own spring. The springs are
   * what make the motion read as a body: the shoulder leads, the elbow and the hand trail it and
   * overshoot, the feet land after the body does.
   */
  useRigLoop((frame) => {
    "worklet";
    const st = sim.value;
    const now = frame.timestamp;
    const dt = Math.min(0.05, Math.max(0.001, (frame.timeSincePreviousFrame ?? 16) / 1000));
    const tgt = st.tgt;
    const mr = moodRig.value;
    for (let i = 0; i < tgt.length; i++) tgt[i] = mr[i];
    const reduced = reduceSV.value > 0.5;

    // Idle layer, by phase: a breath (a squash — taller on the way in, flatter on the way out) and
    // an 8–12 s weight shift onto one foot and back, much slower than the breath and on its own
    // period, so the two never land on the same beat twice. The mood's tempo sets their speed;
    // with the loops off they ease out rather than snap.
    const loopOn = loopsSV.value > 0.5 && !reduced ? 1 : 0;
    st.loopAmt += (loopOn - st.loopAmt) * Math.min(1, dt * 6);
    if (st.loopAmt < 1e-3 && loopOn === 0) st.loopAmt = 0;
    if (st.loopAmt > 0 || breath.value !== 0 || wshift.value !== 0) {
      // Faded in and out by amount, so turning the loops off or back on never pops.
      const tp = Math.max(0.35, tempo.value);
      st.bU = (st.bU + dt / ((BREATH_IN * 2.15) / tp)) % 1;
      st.wU = (st.wU + dt / ((st.wPeriod * 2.12) / tp)) % 1;
      breath.value = st.loopAmt * BREATH_AMP * loopCurve(st.bU, 1 / 2.15);
      wshift.value = st.loopAmt * loopCurve(st.wU, 1 / 2.12);
      // The shoulders rise a hair on the in-breath and the arms counter the weight shift.
      const b = breath.value;
      const w = wshift.value;
      tgt[CH.L_sh] += b * 40 - w * 3.5;
      tgt[CH.R_sh] += b * 40 + w * 3.5;
      tgt[CH.L_el] += -b * 25;
      tgt[CH.R_el] += -b * 25;
    }

    // A real gesture replaces any idle fidget the moment it is requested.
    const req = gestureReq.value;
    if (req.key !== st.gKey) {
      st.gKey = req.key;
      st.gIdx = req.id;
      st.gMirror = req.mirror;
      st.gStart = now;
      if (req.id >= 0) st.iIdx = -1;
    }
    const idle = idleReq.value;
    if (idle.key !== st.iKey) {
      st.iKey = idle.key;
      st.iIdx = st.gIdx >= 0 || walkingSV.value > 0.5 || reduced ? -1 : idle.id;
      st.iMirror = idle.mirror;
      st.iStart = now;
    }
    let walkWanted = walkingSV.value;
    if (st.gIdx >= 0) {
      const g = st.gMirror ? COMPILED_MIRROR[st.gIdx] : COMPILED[st.gIdx];
      const el = now - st.gStart;
      let playing: boolean;
      if (reduced) {
        // One held pose, then back; the reduced springs turn both changes into cross-fades. Only
        // the limbs and the face take the pose: the body does not hop, squash, tip or shift.
        const r = REDUCED[st.gIdx];
        playing = el < r.total;
        if (el < r.hold) {
          const hop = tgt[CH.hop];
          const sq = tgt[CH.squash];
          const ln = tgt[CH.lean];
          const bx = tgt[CH.x];
          applyGesture(g, r.at, tgt, 1);
          tgt[CH.hop] = hop;
          tgt[CH.squash] = sq;
          tgt[CH.lean] = ln;
          tgt[CH.x] = bx;
        }
      } else {
        playing = applyGesture(g, el, tgt, 1);
        if (playing && st.gIdx === WALK_ID) walkWanted = 1;
      }
      if (!playing) {
        st.gIdx = -1;
        runOnJS(rigGestureDone)(st.gKey);
      }
    } else if (!reduced && st.iIdx >= 0) {
      const g = st.iMirror ? COMPILED_MIRROR[st.iIdx] : COMPILED[st.iIdx];
      if (!applyGesture(g, now - st.iStart, tgt, FIDGET_WEIGHT)) st.iIdx = -1;
    }

    // Walk: fade the cycle in and out so starting and stopping never pops; 1.7 steps a second.
    st.walkAmt += (walkWanted - st.walkAmt) * Math.min(1, dt * 5);
    if (st.walkAmt > 0.001) {
      st.walkPhase += dt * Math.PI * 1.7;
      applyWalk(tgt, st.walkPhase, st.walkAmt);
    } else {
      st.walkPhase = 0;
    }

    // Pointing: the nearer hand takes the target and holds it.
    const pt = pointSV.value;
    if (pt.on > 0.5) {
      const b = pt.x >= 100 ? ARM_BASE.R : ARM_BASE.L;
      tgt[b + A.ik] = 1;
      tgt[b + A.ikX] = pt.x;
      tgt[b + A.ikY] = pt.y;
      tgt[b + A.point] = 1;
      tgt[b + A.curl] = 1;
      tgt[b + A.thumb] = -0.6;
      tgt[b + A.wr] = 0;
      tgt[b + A.front] = 0;
    }

    trackIkTargets(st.x, st.v, tgt);

    if (!st.primed) {
      // First frame: start ON the pose. A mascot that flails in from the rest pose every time a
      // screen mounts is the mascot everyone learns to hate.
      for (let i = 0; i < tgt.length; i++) {
        st.x[i] = tgt[i];
        st.v[i] = 0;
      }
      st.primed = true;
    } else if (reduced) {
      stepSprings(st.x, st.v, tgt, dt, SPRING_REDUCED.k, SPRING_REDUCED.z);
    } else {
      stepSprings(st.x, st.v, tgt, dt, SPRING.k, SPRING.z, SPRING.vmax);
    }
    // Front/behind is a layer switch, not a motion: never sprung, flipped at the body's edge.
    resolveFront(st.x, tgt);
    // Published in place: `modify` with forceUpdate notifies the geometry without a fresh array.
    rig.modify((out) => {
      "worklet";
      for (let i = 0; i < out.length; i++) out[i] = st.x[i];
      return out;
    }, true);
  });

  // ── derived: the numbers the renderer actually eats ─────────────────────
  const leanTotal = useDerivedValue(() => {
    "worklet";
    const v = lean.get() + microLean.get() + tLean.get() + wshift.get() * 1.5 + rig.get()[CH.lean];
    return Number.isFinite(v) ? Math.max(-22, Math.min(22, v)) : 0;
  });

  // Follow-through: the tip is a soft spring chasing the body, so a sudden lean leaves it behind,
  // it swings past on the way back, and only then settles. One frame of lag, physically.
  useAnimatedReaction(
    () => leanTotal.get(),
    (v) => {
      "worklet";
      tipLag.set(withSpring(v, { damping: 8, stiffness: 90, mass: 1 }));
    }
  );

  const hopTotal = useDerivedValue(() => {
    "worklet";
    const v = hop.get() + tHop.get() + rig.get()[CH.hop];
    return Number.isFinite(v) ? v : 0;
  });
  const squashTotal = useDerivedValue(() => {
    "worklet";
    const v = squash.get() + breath.get() + tSquash.get() + rig.get()[CH.squash];
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

  /** The body's transform as numbers, shared by the body group and every limb root. */
  const bodyX = useDerivedValue<BodyXform>(() => {
    "worklet";
    const s = volumePreservingScale(squashTotal.get());
    return {
      ox: BODY.cx,
      oy: FOOT_Y,
      tx: rig.get()[CH.x],
      ty: -hopTotal.get(),
      lean: leanTotal.get(),
      sx: Number.isFinite(s.scaleX) ? s.scaleX : 1,
      sy: Number.isFinite(s.scaleY) ? s.scaleY : 1,
      k: 1,
    };
  });
  const bodyTransform = useDerivedValue(() => {
    "worklet";
    const b = bodyX.get();
    return [
      { translateX: Number.isFinite(b.tx) ? b.tx : 0 },
      { translateY: b.ty },
      { rotate: (b.lean * Math.PI) / 180 },
      { scaleX: b.sx },
      { scaleY: b.sy },
    ];
  });
  // Lean pivots at the soles now that the character stands on feet, not at the body's underside.
  const bodyOrigin = { x: BODY.cx, y: FOOT_Y };


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
      (gazeX.get() + moodLookX.get() + rig.get()[CH.lookX]) * GAZE_RADIUS + sacX.get(),
      (gazeY.get() + moodLookY.get() + rig.get()[CH.lookY]) * GAZE_RADIUS + sacY.get(),
      GAZE_RADIUS
    );
    return [{ translateX: Number.isFinite(g.x) ? g.x : 0 }, { translateY: Number.isFinite(g.y) ? g.y : 0 }];
  });

  /** A gesture can squeeze the eyes shut (a yawn, a stretch) on top of the mood and the blink. */
  const eyeTotal = useDerivedValue(() => {
    "worklet";
    const shut = Math.max(0, Math.min(1, rig.get()[CH.eye]));
    return Math.max(0, Math.min(1, eyeOpen.get() * blink.get() * (1 - shut)));
  });
  const lidDrop = useDerivedValue(() => {
    "worklet";
    const open = eyeTotal.get();
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

  /** The mouth's depth, mood plus whatever the gesture adds (a yawn opens it wide). */
  const mouthOpenTotal = useDerivedValue(() => {
    "worklet";
    const v = mouthOpen.get() + rig.get()[CH.mouth];
    return Number.isFinite(v) ? Math.max(0, Math.min(30, v)) : mouthOpen.get();
  });
  const mouthP = useDerivedValue(() => {
    "worklet";
    return mouthPath({ halfWidth: mouthWidth.get(), open: mouthOpenTotal.get(), curve: mouthCurve.get() });
  });
  /** Top and floor of the opening, so the teeth and the tongue are placed off real geometry. */
  const lipY = useDerivedValue(() => {
    "worklet";
    return mouthLipY(mouthWidth.get(), mouthCurve.get());
  });
  const openingH = useDerivedValue(() => {
    "worklet";
    return Math.max(0.5, mouthFloorY(mouthOpenTotal.get()) - lipY.get());
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
    const open = eyeTotal.get();
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

  const scale = useMemo(() => [{ scale: k }, { translateX: -view.x }, { translateY: -view.y }], [k, view.x, view.y]);

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
          {lod === "full" ? (
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
          ) : lod === "mid" ? (
            <Group transform={shadowTransform} origin={{ x: 100, y: 232 }}>
              <Oval x={48} y={226} width={104} height={12} color={C.shadow} opacity={shadowOpacity}>
                <Blur blur={3} />
              </Oval>
            </Group>
          ) : null}

          <MaybeLimbs rig={rig} body={bodyX} hydroScale={hydroScale} lod={lod}>
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

          </MaybeLimbs>
        </Group>
      </Canvas>
    </View>
  );
}

export type { SharedValue };
