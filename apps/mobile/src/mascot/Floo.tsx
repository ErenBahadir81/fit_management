import React, { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Defs, Ellipse, G, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import { springs, timing } from "../theme/motion";
import { FLOO_COLORS, MOOD_LABEL_TR, MOOD_POSE, type Mood, type Pose } from "./moods";

const AEllipse = Animated.createAnimatedComponent(Ellipse);
const APath = Animated.createAnimatedComponent(Path);
const AG = Animated.createAnimatedComponent(G);

export const FLOO_SIZES = { s: 56, m: 96, l: 160 } as const;
export type FlooSize = keyof typeof FLOO_SIZES;

export interface FlooProps {
  mood?: Mood;
  size?: FlooSize | number;
  /** Idle breathing / blinking / tip sway (default true). Set false inside long lists. */
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const EYE_Y = 70;
const EYE_RY = 8;
const EYE_L = 38;
const EYE_R = 62;

function randomBlinkDelay() {
  return 3000 + Math.random() * 2000;
}

/**
 * Floo — the FitFloow flame-drop. SVG body with a gradient, blinking eyes, idle breathing and a
 * swaying flame tip; moods are spring transitions between poses (see `MOOD_POSE`).
 */
export function Floo({ mood = "happy", size = "m", animate = true, style, testID }: FlooProps) {
  const px = typeof size === "number" ? size : FLOO_SIZES[size];
  const reduce = useReducedMotion();
  const loops = animate && !reduce;
  const pose = MOOD_POSE[mood];

  // idle loops
  const breath = useSharedValue(1);
  const blink = useSharedValue(1);
  const sway = useSharedValue(0);
  // pose
  const tilt = useSharedValue(pose.tilt);
  const hop = useSharedValue(pose.hop);
  const eyeOpen = useSharedValue(pose.eyeOpen);
  const eyeX = useSharedValue(pose.eyeX);
  const eyeY = useSharedValue(pose.eyeY);
  const browTilt = useSharedValue(pose.browTilt);
  const browY = useSharedValue(pose.browY);
  const mouth = useSharedValue(pose.mouth);
  const mouthW = useSharedValue(pose.mouthW);
  const armL = useSharedValue(pose.armL);
  const armR = useSharedValue(pose.armR);
  const cheeks = useSharedValue(pose.cheeks);
  const swayAmp = useSharedValue(pose.sway);

  useEffect(() => {
    if (!loops) {
      breath.value = 1;
      sway.value = 0;
      return;
    }
    breath.value = withRepeat(withSequence(withTiming(1.03, { duration: 1200, easing: Easing.inOut(Easing.sin) }), withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) })), -1, false);
    sway.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), withTiming(-1, { duration: 900, easing: Easing.inOut(Easing.sin) })), -1, true);
    return () => {
      cancelAnimation(breath);
      cancelAnimation(sway);
    };
  }, [loops, breath, sway]);

  useEffect(() => {
    if (!loops) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      timer = setTimeout(() => {
        blink.value = withSequence(withTiming(0.05, { duration: 70 }), withTiming(1, { duration: 120 }));
        schedule();
      }, randomBlinkDelay());
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loops, blink]);

  useEffect(() => {
    const p: Pose = MOOD_POSE[mood];
    const go = (v: number) => (reduce ? withTiming(v, timing.reduced) : withSpring(v, springs.bouncy));
    const soft = (v: number) => (reduce ? withTiming(v, timing.reduced) : withSpring(v, springs.gentle));
    tilt.value = go(p.tilt);
    hop.value = mood === "cheer" && !reduce ? withSequence(withSpring(p.hop * 1.8, springs.bouncy), withSpring(p.hop, springs.gentle)) : go(p.hop);
    eyeOpen.value = soft(p.eyeOpen);
    eyeX.value = soft(p.eyeX);
    eyeY.value = soft(p.eyeY);
    browTilt.value = soft(p.browTilt);
    browY.value = soft(p.browY);
    mouth.value = soft(p.mouth);
    mouthW.value = soft(p.mouthW);
    armL.value = go(p.armL);
    armR.value = go(p.armR);
    cheeks.value = withTiming(p.cheeks, timing.slow);
    swayAmp.value = withTiming(p.sway, timing.slow);
  }, [mood, reduce, tilt, hop, eyeOpen, eyeX, eyeY, browTilt, browY, mouth, mouthW, armL, armR, cheeks, swayAmp]);

  const breathStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -hop.value }, { rotate: `${tilt.value}deg` }] }));

  const tipProps = useAnimatedProps(() => ({ rotation: sway.value * 4 * swayAmp.value }));
  const eyeLProps = useAnimatedProps(() => ({ cx: EYE_L + eyeX.value, cy: EYE_Y + eyeY.value, ry: Math.max(0.6, EYE_RY * eyeOpen.value * blink.value) }));
  const eyeRProps = useAnimatedProps(() => ({ cx: EYE_R + eyeX.value, cy: EYE_Y + eyeY.value, ry: Math.max(0.6, EYE_RY * eyeOpen.value * blink.value) }));
  const glintLProps = useAnimatedProps(() => ({ cx: EYE_L + eyeX.value + 2, cy: EYE_Y + eyeY.value - 3, opacity: eyeOpen.value * blink.value > 0.4 ? 1 : 0 }));
  const glintRProps = useAnimatedProps(() => ({ cx: EYE_R + eyeX.value + 2, cy: EYE_Y + eyeY.value - 3, opacity: eyeOpen.value * blink.value > 0.4 ? 1 : 0 }));
  const browLProps = useAnimatedProps(() => ({ rotation: browTilt.value, y: browY.value }));
  const browRProps = useAnimatedProps(() => ({ rotation: -browTilt.value, y: browY.value }));
  const mouthProps = useAnimatedProps(() => ({ d: `M${50 - mouthW.value} 88 Q50 ${88 + mouth.value} ${50 + mouthW.value} 88` }));
  const armLProps = useAnimatedProps(() => ({ rotation: armL.value }));
  const armRProps = useAnimatedProps(() => ({ rotation: armR.value }));
  const cheekProps = useAnimatedProps(() => ({ opacity: cheeks.value }));
  const zzzProps = useAnimatedProps(() => ({ opacity: mood === "sleepy" ? 0.8 : 0 }));

  return (
    <Animated.View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={`Floo, ${MOOD_LABEL_TR[mood]}`}
      style={[{ width: px, height: px * 1.2 }, breathStyle, style]}
    >
      <Animated.View testID={testID ? `${testID}-body` : undefined} style={[StyleSheet.absoluteFill, bodyStyle]}>
        <Svg width={px} height={px * 1.2} viewBox="0 0 100 120">
          <Defs>
            <LinearGradient id="flooBody" x1="0.2" y1="0" x2="0.8" y2="1">
              <Stop offset="0" stopColor={FLOO_COLORS.bodyStart} />
              <Stop offset="1" stopColor={FLOO_COLORS.bodyEnd} />
            </LinearGradient>
          </Defs>
          {/* arms (behind the body) */}
          <AG origin="14, 84" animatedProps={armLProps}>
            <Path d="M14 84 L4 98" stroke={FLOO_COLORS.arm} strokeWidth={7} strokeLinecap="round" />
          </AG>
          <AG origin="86, 84" animatedProps={armRProps}>
            <Path d="M86 84 L96 98" stroke={FLOO_COLORS.arm} strokeWidth={7} strokeLinecap="round" />
          </AG>
          {/* flame tip (sways) */}
          <AG origin="50, 46" animatedProps={tipProps}>
            <Path d="M50 4 C58 20 72 28 68 46 C62 41 38 41 32 46 C28 28 42 20 50 4 Z" fill="url(#flooBody)" />
          </AG>
          {/* body */}
          <Path d="M50 26 C74 26 92 46 92 74 A42 42 0 1 1 8 74 C8 46 26 26 50 26 Z" fill="url(#flooBody)" />
          <Ellipse cx={34} cy={44} rx={9} ry={5} fill={FLOO_COLORS.highlight} opacity={0.28} transform="rotate(-30 34 44)" />
          {/* cheeks */}
          <AEllipse cx={28} cy={82} rx={6} ry={3.5} fill={FLOO_COLORS.cheeks} animatedProps={cheekProps} />
          <AEllipse cx={72} cy={82} rx={6} ry={3.5} fill={FLOO_COLORS.cheeks} animatedProps={cheekProps} />
          {/* brows */}
          <AG origin={`${EYE_L}, 56`} animatedProps={browLProps}>
            <Path d={`M${EYE_L - 6} 56 L${EYE_L + 6} 56`} stroke={FLOO_COLORS.eyes} strokeWidth={2.4} strokeLinecap="round" opacity={0.9} />
          </AG>
          <AG origin={`${EYE_R}, 56`} animatedProps={browRProps}>
            <Path d={`M${EYE_R - 6} 56 L${EYE_R + 6} 56`} stroke={FLOO_COLORS.eyes} strokeWidth={2.4} strokeLinecap="round" opacity={0.9} />
          </AG>
          {/* eyes */}
          <AEllipse rx={6} fill={FLOO_COLORS.eyes} animatedProps={eyeLProps} />
          <AEllipse rx={6} fill={FLOO_COLORS.eyes} animatedProps={eyeRProps} />
          <AEllipse rx={1.8} ry={1.8} fill={FLOO_COLORS.highlight} animatedProps={glintLProps} />
          <AEllipse rx={1.8} ry={1.8} fill={FLOO_COLORS.highlight} animatedProps={glintRProps} />
          {/* mouth */}
          <APath stroke={FLOO_COLORS.eyes} strokeWidth={2.6} strokeLinecap="round" fill="none" animatedProps={mouthProps} />
          {/* sleepy zzz */}
          <AG animatedProps={zzzProps}>
            <SvgText x={78} y={40} fontSize={11} fontWeight="700" fill={FLOO_COLORS.bodyStart}>
              z
            </SvgText>
            <SvgText x={86} y={28} fontSize={8} fontWeight="700" fill={FLOO_COLORS.bodyStart}>
              z
            </SvgText>
          </AG>
        </Svg>
      </Animated.View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none" />
    </Animated.View>
  );
}
