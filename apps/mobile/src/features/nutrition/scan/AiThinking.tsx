import React, { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Floo } from "../../../mascot";
import { useTheme } from "../../../theme/ThemeProvider";
import { absoluteFill, dark, radii, spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";

/** Marks drawn over the camera / photo scrim: always light. `onPrimary` is navy in dark mode. */
const ON_SCRIM = dark.ink;

const SWEEP_MS = 1600;
const BRACKET = 42;
export const SCAN_LOOKING_LABEL = "Tabağına bakıyorum…";

export interface AiThinkingProps {
  /** The still we are analysing. */
  uri: string | null;
  testID?: string;
}

/**
 * While the photo is being analysed — and only as long as that takes: the captured still under a
 * sweeping scan line and pulsing corner brackets, with Floo thinking. The motion says "working";
 * there is no scripted sequence and no minimum duration. Reduced motion keeps it still.
 */
export function AiThinking({ uri, testID = "ai-thinking" }: AiThinkingProps) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const label = SCAN_LOOKING_LABEL;

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

  return (
    <View style={styles.root} testID={testID}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" testID="scan-photo" /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} />

      <Animated.View pointerEvents="none" style={[styles.sweep, { width }, sweepStyle]}>
        <LinearGradient
          colors={["transparent", `${colors.floo}66`, colors.floo, `${colors.floo}66`, "transparent"]}
          locations={[0, 0.35, 0.5, 0.65, 1]}
          style={styles.sweepFill}
        />
      </Animated.View>

      <View pointerEvents="none" style={styles.frame}>
        <Animated.View style={[styles.bracket, styles.tl, { borderColor: ON_SCRIM }, bracketStyle]} />
        <Animated.View style={[styles.bracket, styles.tr, { borderColor: ON_SCRIM }, bracketStyle]} />
        <Animated.View style={[styles.bracket, styles.bl, { borderColor: ON_SCRIM }, bracketStyle]} />
        <Animated.View style={[styles.bracket, styles.br, { borderColor: ON_SCRIM }, bracketStyle]} />
      </View>

      <View pointerEvents="none" style={styles.statusWrap}>
        <View style={styles.flooSlot}>
          <Floo mood="think" size="s" testID="scan-floo" />
        </View>
        <Animated.View entering={reduce ? undefined : FadeIn.duration(200)} style={[styles.statusPill, { backgroundColor: colors.overlay }]}>
          <Text variant="bodyStrong" style={{ color: ON_SCRIM }} accessibilityLiveRegion="polite" testID="scan-status">
            {label}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
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
  statusWrap: { position: "absolute", left: 0, right: 0, bottom: "16%", alignItems: "center", gap: spacing.md },
  flooSlot: { opacity: 0.95 },
  statusPill: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill },
});
