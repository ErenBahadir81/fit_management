import React, { useEffect, useId, useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { ClipPath, Defs, Ellipse, G, Image as SvgImage, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import { springs, timing } from "../theme/motion";
import {
  ARM_PATH,
  BROW_Y,
  CHEEK,
  DROPLET_PATH,
  EYE,
  GAZE_RADIUS,
  MITTEN,
  MOUTH_Y,
  SHOULDER,
  mouthPath,
  saccadeTarget,
  volumePreservingScale,
} from "./flooGeometry";
import { FLOO_COLORS as C, MOOD_LABEL_TR, MOOD_POSE, type FlooMood, type Pose } from "./moods";

/**
 * The rendered body. Built by `assets/mascot/floo_build.py` with an orthographic camera framed on
 * Floo's 200 × 250 viewBox, so it drops in under the vector face without moving a face constant.
 */
const BODY_SPRITE = require("../../assets/mascot/floo-body.png");

const AEllipse = Animated.createAnimatedComponent(Ellipse);
const APath = Animated.createAnimatedComponent(Path);
const AG = Animated.createAnimatedComponent(G);

export const FLOO_SIZES = { s: 56, m: 96, l: 160 } as const;
export type FlooSize = keyof typeof FLOO_SIZES;

/**
 * Two viewBoxes. `full` reserves the strip below the body for the boots and the ground shadow;
 * `simple` drops both, so it also has to crop that strip away — otherwise a chip-sized Floo renders
 * two thirds the size of its own box with dead space underneath.
 */
const VIEWBOX = {
  full: { x: 0, y: 0, w: 200, h: 250 },
  simple: { x: 28, y: 46, w: 144, h: 176 },
} as const;
export const FLOO_ASPECT = VIEWBOX.full.h / VIEWBOX.full.w;
/** Aspect ratio for a given detail level — callers sizing a box need the one they will get. */
export function flooAspect(detail: FlooDetail): number {
  return VIEWBOX[detail].h / VIEWBOX[detail].w;
}

/** Below this pixel size the arms and boots are noise, so they are dropped. */
const SIMPLE_BELOW = 72;

export type FlooDetail = "full" | "simple";

export interface FlooProps {
  mood?: FlooMood;
  size?: FlooSize | number;
  /** Idle breathing / blinking / glancing (default true). Set false inside long lists. */
  animate?: boolean;
  /** `simple` drops the arms and boots — at chip sizes they are noise. Defaults by size. */
  detail?: FlooDetail;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const EYE_TOP = EYE.y - EYE.ry;
const EYE_BOTTOM = EYE.y + EYE.ry;
/** Lid ellipses are oversized so their curved edge, not their corner, does the covering. */
const LID_RX = EYE.rx + 5;
const LID_RY = EYE.ry + 2;
const IRIS_RX = 13;
const IRIS_RY = 14;

function blinkDelay() {
  return 2600 + Math.random() * 2600;
}
function glanceDelay() {
  return 1800 + Math.random() * 2800;
}

/**
 * Floo — FitFloow's droplet. A Blender-rendered body under a live vector face.
 *
 * The split is deliberate. The body, knit collar, legs and boots never change shape per mood, so
 * they are one Cycles render and get real subsurface scattering, a clearcoat sheen and a geometric
 * rim light — none of which a stack of SVG gradients was ever going to fake. Everything that
 * *animates* stays vector and stays on the UI thread: eyes, brows, mouth, blush, arms, and the
 * ground shadow. So all ten moods still spring between poses, Floo still blinks and glances on its
 * own schedule, and nothing became a flipbook of pre-baked frames.
 *
 * The load-bearing detail is that the render's camera is orthographic and framed on this exact
 * viewBox, so the sprite and `flooGeometry`'s constants describe the same character. See the note
 * at the body below.
 *
 * The life comes from area-preserving squash and stretch on the breath (a blob that only scales
 * reads as a scaling blob), a slow whole-body lean underneath the pose, and eyes with a schedule of
 * their own.
 */
export function Floo({ mood = "happy", size = "m", animate = true, detail, style, testID }: FlooProps) {
  const px = typeof size === "number" ? size : FLOO_SIZES[size];
  const reduce = useReducedMotion();
  const loops = animate && !reduce;
  const level: FlooDetail = detail ?? (px >= SIMPLE_BELOW ? "full" : "simple");
  const full = level === "full";
  const vb = VIEWBOX[level];
  const height = px * (vb.h / vb.w);
  const pose = MOOD_POSE[mood];

  // ── idle loops ──────────────────────────────────────────────────────────
  const breath = useSharedValue(0); // drives squash
  const blink = useSharedValue(1); // 1 open, 0 shut
  const sway = useSharedValue(0); // −1 … 1, secondary motion
  const glanceX = useSharedValue(0);
  const glanceY = useSharedValue(0);

  // ── pose ────────────────────────────────────────────────────────────────
  const tilt = useSharedValue(pose.tilt);
  const hop = useSharedValue(pose.hop);
  const squash = useSharedValue(pose.squash);
  const eyeOpen = useSharedValue(pose.eyeOpen);
  const eyeSquint = useSharedValue(pose.eyeSquint);
  const gazeX = useSharedValue(pose.gazeX);
  const gazeY = useSharedValue(pose.gazeY);
  const browTilt = useSharedValue(pose.browTilt);
  const browY = useSharedValue(pose.browY);
  const mouthCurve = useSharedValue(pose.mouthCurve);
  const mouthOpen = useSharedValue(pose.mouthOpen);
  const mouthW = useSharedValue(pose.mouthHalfWidth);
  const armL = useSharedValue(pose.armL);
  const armR = useSharedValue(pose.armR);
  const cheeks = useSharedValue(pose.cheeks);
  const swayAmp = useSharedValue(pose.sway);

  useEffect(() => {
    if (!loops) {
      breath.value = 0;
      sway.value = 0;
      glanceX.value = 0;
      glanceY.value = 0;
      return;
    }
    // Breathing is not a sine on scale: it squashes on the out-breath and stretches on the in-breath,
    // which is what makes a soft body read as soft.
    const d = 1400 / Math.max(0.3, pose.tempo);
    breath.value = withRepeat(
      withSequence(
        withTiming(0.026, { duration: d, easing: Easing.inOut(Easing.sin) }),
        withTiming(-0.02, { duration: d, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    sway.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => {
      cancelAnimation(breath);
      cancelAnimation(sway);
    };
  }, [loops, pose.tempo, breath, sway, glanceX, glanceY]);

  useEffect(() => {
    if (!loops) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      timer = setTimeout(() => {
        // A double blink now and then; a metronome blink is uncanny.
        const twice = Math.random() < 0.22;
        const one = [withTiming(0.02, { duration: 60 }), withTiming(1, { duration: 130 })];
        blink.value = withSequence(...(twice ? [...one, withTiming(0.02, { duration: 55 }), withTiming(1, { duration: 120 })] : one));
        schedule();
      }, blinkDelay());
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loops, blink]);

  useEffect(() => {
    if (!loops) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      timer = setTimeout(() => {
        const t = saccadeTarget(3.2);
        // Saccades are fast and land hard — eyes do not ease into a new fixation.
        glanceX.value = withTiming(t.x, { duration: 90, easing: Easing.out(Easing.quad) });
        glanceY.value = withTiming(t.y, { duration: 90, easing: Easing.out(Easing.quad) });
        schedule();
      }, glanceDelay());
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loops, glanceX, glanceY]);

  useEffect(() => {
    const p: Pose = MOOD_POSE[mood];
    const go = (v: number) => (reduce ? withTiming(v, timing.reduced) : withSpring(v, springs.bouncy));
    const soft = (v: number) => (reduce ? withTiming(v, timing.reduced) : withSpring(v, springs.gentle));
    // A jump needs anticipation: squash into the ground, then leave it. Without the crouch the
    // character teleports upward.
    const airborne = p.hop > 4 && !reduce;
    hop.value = airborne ? withSequence(withTiming(-3, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(p.hop, springs.bouncy)) : go(p.hop);
    squash.value = airborne ? withSequence(withTiming(0.14, { duration: 110 }), withSpring(p.squash, springs.bouncy)) : soft(p.squash);
    tilt.value = go(p.tilt);
    eyeOpen.value = soft(p.eyeOpen);
    eyeSquint.value = soft(p.eyeSquint);
    gazeX.value = soft(p.gazeX);
    gazeY.value = soft(p.gazeY);
    browTilt.value = soft(p.browTilt);
    browY.value = soft(p.browY);
    mouthCurve.value = soft(p.mouthCurve);
    mouthOpen.value = soft(p.mouthOpen);
    mouthW.value = soft(p.mouthHalfWidth);
    armL.value = go(p.armL);
    armR.value = go(p.armR);
    cheeks.value = withTiming(p.cheeks, timing.slow);
    swayAmp.value = withTiming(p.sway, timing.slow);
  }, [mood, reduce, tilt, hop, squash, eyeOpen, eyeSquint, gazeX, gazeY, browTilt, browY, mouthCurve, mouthOpen, mouthW, armL, armR, cheeks, swayAmp]);

  // ── derived ─────────────────────────────────────────────────────────────
  /** Pose squash plus the breath, as one number. */
  const totalSquash = useDerivedValue(() => squash.get() + breath.get());
  /** Pupil position: the pose's gaze, nudged by the idle saccade. */
  const pupilX = useDerivedValue(() => Math.max(-GAZE_RADIUS, Math.min(GAZE_RADIUS, gazeX.get() + glanceX.get())));
  const pupilY = useDerivedValue(() => Math.max(-GAZE_RADIUS, Math.min(GAZE_RADIUS, gazeY.get() + glanceY.get())));
  /** How shut the eye is, in px of lid travel. */
  const lidDrop = useDerivedValue(() => (1 - Math.max(0, Math.min(1, eyeOpen.get() * blink.get()))) * (EYE.ry * 2));

  // Hop and tilt stay on their own view so the pose transform is one flat, testable pair.
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -hop.get() }, { rotate: `${tilt.get()}deg` }] }));
  // A whole-body lean is the idle "alive" signal now that the crown carries no appendage.
  const leanStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sway.get() * 0.9 * swayAmp.get()}deg` }] }));
  const squashStyle = useAnimatedStyle(() => {
    const s = volumePreservingScale(totalSquash.get());
    return { transform: [{ scaleX: s.scaleX }, { scaleY: s.scaleY }] };
  });

  const armLProps = useAnimatedProps(() => ({ rotation: -armL.get() }));
  const armRProps = useAnimatedProps(() => ({ rotation: -armR.get() }));
  const browLProps = useAnimatedProps(() => ({ rotation: browTilt.get(), y: browY.get() }));
  const browRProps = useAnimatedProps(() => ({ rotation: -browTilt.get(), y: browY.get() }));
  const cheekProps = useAnimatedProps(() => ({ opacity: cheeks.get() }));
  const mouthProps = useAnimatedProps(() => ({ d: mouthPath({ halfWidth: mouthW.get(), open: mouthOpen.get(), curve: mouthCurve.get() }) }));
  const tongueProps = useAnimatedProps(() => {
    const o = mouthOpen.get();
    return {
      cx: 0,
      cy: mouthCurve.get() * 0.5 + o * 0.64,
      rx: Math.max(0.1, mouthW.get() * 0.44),
      ry: Math.max(0.1, o * 0.3),
      opacity: Math.max(0, Math.min(1, (o - 8) / 5)),
    };
  });
  // The shadow tracks the jump: smaller and softer the further off the ground Floo is.
  const shadowProps = useAnimatedProps(() => {
    const lift = Math.max(0, Math.min(1, hop.get() / 16));
    return { rx: 54 * (1 - lift * 0.32), opacity: 0.42 * (1 - lift * 0.5) };
  });

  const irisL = useAnimatedProps(() => ({ cx: EYE.left + pupilX.get(), cy: EYE.y + pupilY.get() + 1 }));
  const irisR = useAnimatedProps(() => ({ cx: EYE.right + pupilX.get(), cy: EYE.y + pupilY.get() + 1 }));
  const glintL = useAnimatedProps(() => ({ cx: EYE.left + pupilX.get() - 4.6, cy: EYE.y + pupilY.get() - 4.4 }));
  const glintR = useAnimatedProps(() => ({ cx: EYE.right + pupilX.get() - 4.6, cy: EYE.y + pupilY.get() - 4.4 }));
  const glintL2 = useAnimatedProps(() => ({ cx: EYE.left + pupilX.get() + 5.2, cy: EYE.y + pupilY.get() + 5.6 }));
  const glintR2 = useAnimatedProps(() => ({ cx: EYE.right + pupilX.get() + 5.2, cy: EYE.y + pupilY.get() + 5.6 }));
  // Lids are oversized ellipses sliding in from above and below, clipped to the eye.
  const lidTopL = useAnimatedProps(() => ({ cx: EYE.left, cy: EYE_TOP - LID_RY + lidDrop.get() }));
  const lidTopR = useAnimatedProps(() => ({ cx: EYE.right, cy: EYE_TOP - LID_RY + lidDrop.get() }));
  const lidBotL = useAnimatedProps(() => ({ cx: EYE.left, cy: EYE_BOTTOM + LID_RY - eyeSquint.get() * 17 }));
  const lidBotR = useAnimatedProps(() => ({ cx: EYE.right, cy: EYE_BOTTOM + LID_RY - eyeSquint.get() * 17 }));

  const label = useMemo(() => `Floo, ${MOOD_LABEL_TR[mood]}`, [mood]);

  /**
   * SVG ids are global to the document. On native each `Svg` is its own document, but the web build
   * inlines every one of them into the same DOM — so two Floos on a screen would silently share the
   * first one's gradients and clip paths. Scope them per instance. (`useId` contains colons, which
   * are not valid in a `url(#…)` reference.)
   */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `${name}${uid}`;

  return (
    <Animated.View testID={testID} accessibilityRole="image" accessibilityLabel={label} style={[{ width: px, height }, style]}>
      <Animated.View testID={testID ? `${testID}-body` : undefined} style={[StyleSheet.absoluteFill, bodyStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, leanStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, squashStyle]}>
          <Svg width={px} height={height} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}>
            <Defs>
              {/* Fallback body only — the sprite covers this. */}
              <LinearGradient id={id("fBody")} gradientUnits="userSpaceOnUse" x1="46" y1="24" x2="164" y2="214">
                <Stop offset="0" stopColor={C.bodyLight} />
                <Stop offset="0.45" stopColor={C.bodyMid} />
                <Stop offset="1" stopColor={C.bodyDeep} />
              </LinearGradient>
              {/* Eyelids have to vanish into the RENDER, not into the fallback gradient. These two
                  stops are sampled straight out of floo-body.png across the eye band, where the key
                  light leaves the body far lighter than `bodyMid` — filling a lid with the body
                  gradient would flash a dark patch on every blink. */}
              <LinearGradient id={id("fLid")} gradientUnits="userSpaceOnUse" x1="58" y1="100" x2="142" y2="146">
                <Stop offset="0" stopColor={C.lidLight} />
                <Stop offset="1" stopColor={C.lidDeep} />
              </LinearGradient>
              <LinearGradient id={id("fIris")} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#0A0E16" />
                <Stop offset="0.62" stopColor={C.eye} />
                <Stop offset="1" stopColor={C.eyeLift} />
              </LinearGradient>
              <RadialGradient id={id("fBlush")} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={C.cheeks} stopOpacity="0.9" />
                <Stop offset="0.6" stopColor={C.cheeks} stopOpacity="0.5" />
                <Stop offset="1" stopColor={C.cheeks} stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id={id("fShadow")} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={C.shadow} stopOpacity="0.9" />
                <Stop offset="1" stopColor={C.shadow} stopOpacity="0" />
              </RadialGradient>
              <ClipPath id={id("fEyeL")}>
                <Ellipse cx={EYE.left} cy={EYE.y} rx={EYE.rx} ry={EYE.ry} />
              </ClipPath>
              <ClipPath id={id("fEyeR")}>
                <Ellipse cx={EYE.right} cy={EYE.y} rx={EYE.rx} ry={EYE.ry} />
              </ClipPath>
            </Defs>

            {/* ground shadow — drawn first, sits under everything the boots stand on */}
            {full ? <AEllipse cx={100} cy={244} ry={7} fill={`url(#${id("fShadow")})`} animatedProps={shadowProps} /> : null}

            {/* ── body ──
                The droplet, its knit collar, legs and boots are a single Cycles render
                (`assets/mascot/floo_build.py`, reproducible with Blender). An ORTHOGRAPHIC camera
                framed on this exact 200 × 250 viewBox is what makes the swap safe: the sprite's
                silhouette matches `DROPLET_PATH` to within a third of a viewBox unit, so every face
                constant below still lands where it was laid out, and the `simple` viewBox crops the
                boots away by itself.

                Real shading replaces the stack of gradient and highlight overlays this used to
                carry — a rim light on geometry beats a stroked arc guessing where the edge is.

                The vector droplet stays underneath: if the bitmap ever fails to decode, Floo is
                still a shaded droplet rather than a hole. */}
            <Path d={DROPLET_PATH} fill={`url(#${id("fBody")})`} />
            <SvgImage href={BODY_SPRITE} x={0} y={0} width={200} height={250} preserveAspectRatio="xMidYMid meet" />

            {/* ── face ── */}
            <AEllipse cx={CHEEK.left} cy={CHEEK.y} rx={CHEEK.rx} ry={CHEEK.ry} fill={`url(#${id("fBlush")})`} animatedProps={cheekProps} />
            <AEllipse cx={CHEEK.right} cy={CHEEK.y} rx={CHEEK.rx} ry={CHEEK.ry} fill={`url(#${id("fBlush")})`} animatedProps={cheekProps} />

            <AG origin={`${EYE.left}, ${BROW_Y}`} animatedProps={browLProps}>
              <Path d={`M${EYE.left - 13} ${BROW_Y + 3}Q${EYE.left} ${BROW_Y - 5} ${EYE.left + 13} ${BROW_Y + 1}`} stroke={C.bodyDeep} strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.85} />
            </AG>
            <AG origin={`${EYE.right}, ${BROW_Y}`} animatedProps={browRProps}>
              <Path d={`M${EYE.right + 13} ${BROW_Y + 3}Q${EYE.right} ${BROW_Y - 5} ${EYE.right - 13} ${BROW_Y + 1}`} stroke={C.bodyDeep} strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.85} />
            </AG>

            <G clipPath={`url(#${id("fEyeL")})`}>
              <Ellipse cx={EYE.left} cy={EYE.y} rx={EYE.rx} ry={EYE.ry} fill="#FFFFFF" />
              <Ellipse cx={EYE.left} cy={EYE.y - 12} rx={EYE.rx} ry={9} fill={C.bodyDeep} opacity={0.1} />
              <AEllipse rx={IRIS_RX} ry={IRIS_RY} fill={`url(#${id("fIris")})`} animatedProps={irisL} />
              <AEllipse rx={5.4} ry={5.4} fill={C.highlight} animatedProps={glintL} />
              <AEllipse rx={2.4} ry={2.4} fill={C.highlight} opacity={0.7} animatedProps={glintL2} />
              <AEllipse rx={LID_RX} ry={LID_RY} fill={`url(#${id("fLid")})`} animatedProps={lidTopL} />
              <AEllipse rx={LID_RX} ry={LID_RY} fill={`url(#${id("fLid")})`} animatedProps={lidBotL} />
            </G>
            <G clipPath={`url(#${id("fEyeR")})`}>
              <Ellipse cx={EYE.right} cy={EYE.y} rx={EYE.rx} ry={EYE.ry} fill="#FFFFFF" />
              <Ellipse cx={EYE.right} cy={EYE.y - 12} rx={EYE.rx} ry={9} fill={C.bodyDeep} opacity={0.1} />
              <AEllipse rx={IRIS_RX} ry={IRIS_RY} fill={`url(#${id("fIris")})`} animatedProps={irisR} />
              <AEllipse rx={5.4} ry={5.4} fill={C.highlight} animatedProps={glintR} />
              <AEllipse rx={2.4} ry={2.4} fill={C.highlight} opacity={0.7} animatedProps={glintR2} />
              <AEllipse rx={LID_RX} ry={LID_RY} fill={`url(#${id("fLid")})`} animatedProps={lidTopR} />
              <AEllipse rx={LID_RX} ry={LID_RY} fill={`url(#${id("fLid")})`} animatedProps={lidBotR} />
            </G>

                {/* Hinged on the outline and drawn in front, so the whole arm reads, not just the hand. */}
            {full ? (
              <>
                <AG origin={`${SHOULDER.left.x}, ${SHOULDER.left.y}`} animatedProps={armLProps}>
                  <G x={SHOULDER.left.x} y={SHOULDER.left.y} scaleX={1}>
                    <Path d={ARM_PATH} fill="none" stroke={C.bodyDeep} strokeWidth={12} strokeLinecap="round" />
                    <Ellipse cx={MITTEN.x} cy={MITTEN.y} rx={MITTEN.rx} ry={MITTEN.ry} fill={C.mitten} transform={`rotate(-18 ${MITTEN.x} ${MITTEN.y})`} />
                    <Ellipse cx={MITTEN.x - 3} cy={MITTEN.y - 5} rx={5} ry={4} fill={C.highlight} opacity={0.2} />
                  </G>
                </AG>
                <AG origin={`${SHOULDER.right.x}, ${SHOULDER.right.y}`} animatedProps={armRProps}>
                  <G x={SHOULDER.right.x} y={SHOULDER.right.y} scaleX={-1}>
                    <Path d={ARM_PATH} fill="none" stroke={C.bodyDeep} strokeWidth={12} strokeLinecap="round" />
                    <Ellipse cx={MITTEN.x} cy={MITTEN.y} rx={MITTEN.rx} ry={MITTEN.ry} fill={C.mitten} transform={`rotate(-18 ${MITTEN.x} ${MITTEN.y})`} />
                    <Ellipse cx={MITTEN.x - 3} cy={MITTEN.y - 5} rx={5} ry={4} fill={C.highlight} opacity={0.2} />
                  </G>
                </AG>
              </>
            ) : null}

            <G x={100} y={MOUTH_Y}>
              {/* stroked as well as filled: at `sad`/`think` widths the fill alone is a hairline */}
              <APath fill={C.mouth} stroke={C.mouth} strokeWidth={3.4} strokeLinejoin="round" animatedProps={mouthProps} />
              <AEllipse fill={C.tongue} animatedProps={tongueProps} />
            </G>
          </Svg>
        </Animated.View>
        </Animated.View>
      </Animated.View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none" />
    </Animated.View>
  );
}
