import React, { useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Floo } from "../../../mascot/Floo";
import { useTheme } from "../../../theme/ThemeProvider";
import { absoluteFill, radii, spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";
import { SCAN_STATUS_LABELS } from "../model/scanMachine";

const SWEEP_MS = 1600;
const BRACKET = 42;
const PARTICLES = 9;

export interface AiThinkingProps {
  /** The still we are analysing. */
  uri: string | null;
  statusIndex: number;
  testID?: string;
}

/**
 * The "AI is thinking" theatre: the captured still under a sweeping scan line, pulsing corner
 * brackets, drifting particles and a status label that steps through the pipeline — with Floo
 * thinking in the corner. All animation runs on the UI thread; reduced motion keeps it still.
 */
export function AiThinking({ uri, statusIndex, testID = "ai-thinking" }: AiThinkingProps) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const label = SCAN_STATUS_LABELS[Math.min(statusIndex, SCAN_STATUS_LABELS.length - 1)];

  const sweep = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      sweep.value = 0.5;
      pulse.value = 0.5;
      return;
    }
    sweep.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), -1, true);
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) })), -1, false);
    return () => {
      cancelAnimation(sweep);
      cancelAnimation(pulse);
    };
  }, [pulse, reduce, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sweep.value * height * 0.82 }], opacity: 0.9 }));
  const bracketStyle = useAnimatedStyle(() => ({ opacity: 0.55 + pulse.value * 0.45, transform: [{ scale: 1 + pulse.value * 0.03 }] }));

  const particles = useMemo(
    () => Array.from({ length: PARTICLES }, (_, i) => ({ key: i, left: 8 + ((i * 97) % 84), size: 3 + (i % 3), delay: i * 220, distance: 90 + (i % 4) * 40 })),
    []
  );

  return (
    <View style={styles.root} testID={testID}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" testID="scan-photo" /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} />

      <Animated.View pointerEvents="none" style={[styles.sweep, { width }, sweepStyle]}>
        <LinearGradient
          colors={["transparent", `${colors.gradient[1]}66`, colors.gradient[1], `${colors.gradient[1]}66`, "transparent"]}
          locations={[0, 0.35, 0.5, 0.65, 1]}
          style={styles.sweepFill}
        />
      </Animated.View>

      <View pointerEvents="none" style={styles.frame}>
        <Animated.View style={[styles.bracket, styles.tl, { borderColor: colors.onPrimary }, bracketStyle]} />
        <Animated.View style={[styles.bracket, styles.tr, { borderColor: colors.onPrimary }, bracketStyle]} />
        <Animated.View style={[styles.bracket, styles.bl, { borderColor: colors.onPrimary }, bracketStyle]} />
        <Animated.View style={[styles.bracket, styles.br, { borderColor: colors.onPrimary }, bracketStyle]} />
      </View>

      <View pointerEvents="none" style={styles.particles} testID="scan-particles">
        {particles.map((p) => (
          <Particle key={p.key} left={`${p.left}%`} size={p.size} delay={p.delay} distance={p.distance} color={colors.gradient[1]} reduce={reduce} />
        ))}
      </View>

      <View pointerEvents="none" style={styles.statusWrap}>
        <View style={styles.flooSlot}>
          <Floo mood="think" size="s" testID="scan-floo" />
        </View>
        <Animated.View key={label} entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={[styles.statusPill, { backgroundColor: colors.overlay }]}>
          <Text variant="bodyStrong" style={{ color: colors.onPrimary }} accessibilityLiveRegion="polite" testID="scan-status">
            {label}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

function Particle({ left, size, delay, distance, color, reduce }: { left: `${number}%`; size: number; delay: number; distance: number; color: string; reduce: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(p);
  }, [delay, p, reduce]);
  const style = useAnimatedStyle(() => ({
    opacity: reduce ? 0.4 : Math.sin(p.value * Math.PI) * 0.8,
    transform: [{ translateY: -p.value * distance }],
  }));
  return <Animated.View style={[styles.particle, { left, width: size, height: size, borderRadius: size, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  root: { ...absoluteFill, overflow: "hidden" },
  sweep: { position: "absolute", top: "6%", height: 160 },
  sweepFill: { flex: 1 },
  frame: { ...absoluteFill, margin: spacing.xxl },
  bracket: { position: "absolute", width: BRACKET, height: BRACKET, borderWidth: 3, borderRadius: radii.sm },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  particles: { ...absoluteFill, justifyContent: "flex-end", paddingBottom: "28%" },
  particle: { position: "absolute", bottom: 0 },
  statusWrap: { position: "absolute", left: 0, right: 0, bottom: "16%", alignItems: "center", gap: spacing.md },
  flooSlot: { opacity: 0.95 },
  statusPill: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill },
});
