import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  Keyframe,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { clamp } from "@fitfloow/core";
import * as sound from "../../../lib/sound";
import { springs } from "../../../theme/motion";
import { useTheme } from "../../../theme/ThemeProvider";
import { absoluteFill, radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { REST_PRESETS, REST_STEP_SECONDS, formatRest, type RestController } from "./restEngine";
import { isRestSoundMuted, setRestSoundMuted } from "./restPrefs";

const DIAL = 116;
const DIAL_STROKE = 8;
/** Below this the rest is about to end: warm colour, a beat per second, a cue in the hand. */
const URGENT_AT = 3;
/** The one point in the countdown a screen-reader user is told about, other than start and change. */
const NEARLY_OVER_AT = 10;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Pops once, then leaves — a rest that is over should land, not blink out. */
const landing = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  25: { opacity: 1, transform: [{ scale: 1.02 }] },
  100: { opacity: 0, transform: [{ scale: 0.96 }] },
}).duration(280);

export interface RestTimerProps {
  controller: RestController;
  testID?: string;
}

/**
 * The between-sets screen. It is the only thing worth looking at while it is up, so it gets the
 * room: the countdown is the largest thing in the app, the ring drains continuously rather than
 * stepping once a second, and −15 / +15 are under the thumb that just finished the set.
 *
 * Skipping is deliberate — its own control at the bottom, nowhere near the adjust buttons, because
 * the old "tap anywhere to skip" pill lost people their rest by accident.
 */
export function RestTimer({ controller, testID = "rest-timer" }: RestTimerProps): React.ReactElement | null {
  const { colors, shadows } = useTheme();
  const reduce = useReducedMotion();
  const [muted, setMutedState] = useState(() => isRestSoundMuted());

  const { running, remaining, total, presetSeconds } = controller;
  const urgent = running && remaining > 0 && remaining <= URGENT_AT;
  const clock = formatRest(remaining);
  const announcement = running && remaining <= NEARLY_OVER_AT ? `Son ${NEARLY_OVER_AT} saniye` : `${formatRest(total)} dinlenme`;

  // iOS has no live regions; announce by hand, and only when the sentence actually changes.
  useEffect(() => {
    if (!running || Platform.OS !== "ios") return;
    AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement, running]);

  const beat = useSharedValue(1);
  useEffect(() => {
    if (reduce || !urgent) return;
    beat.set(withSequence(withTiming(1.07, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(1, springs.snappy)));
  }, [beat, reduce, remaining, urgent]);
  const beatStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.get() }] }));

  if (!running) return null;

  const toggleMute = () => {
    const next = !muted;
    setRestSoundMuted(next);
    sound.setMuted(next);
    setMutedState(next);
  };

  const accent = urgent ? colors.warning : colors.primary;

  return (
    <Animated.View
      testID={testID}
      entering={reduce ? FadeIn.duration(150) : FadeInDown.springify().damping(22).stiffness(280).withInitialValues({ transform: [{ translateY: 14 }] })}
      exiting={reduce ? FadeOut.duration(150) : landing}
      style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, shadows.elevated]}
    >
      {/* Android reads this live region; iOS gets `announceForAccessibility` above. Invisible either way. */}
      <Text testID="rest-announcement" accessibilityLiveRegion="polite" style={styles.announcement}>
        {announcement}
      </Text>

      <View style={styles.hero}>
        <Pressable
          testID="rest-minus"
          onPress={() => controller.adjust(-REST_STEP_SECONDS)}
          haptic="medium"
          minTarget={false}
          accessibilityLabel={`${REST_STEP_SECONDS} saniye azalt`}
          style={[styles.step, { backgroundColor: colors.surfaceMuted }]}
        >
          <Text variant="title" tabular color="ink">{`−${REST_STEP_SECONDS}`}</Text>
        </Pressable>

        <Dial remaining={remaining} total={total} color={accent} track={colors.ringTrack} reduce={reduce}>
          <Animated.View style={beatStyle}>
            <Text
              testID="rest-remaining"
              variant="hero"
              tabular
              align="center"
              numberOfLines={1}
              adjustsFontSizeToFit
              accessibilityLabel={`${clock} kaldı`}
              style={{ color: urgent ? colors.warning : colors.ink }}
            >
              {clock}
            </Text>
          </Animated.View>
        </Dial>

        <Pressable
          testID="rest-plus"
          onPress={() => controller.adjust(REST_STEP_SECONDS)}
          haptic="medium"
          minTarget={false}
          accessibilityLabel={`${REST_STEP_SECONDS} saniye ekle`}
          style={[styles.step, { backgroundColor: colors.surfaceMuted }]}
        >
          <Text variant="title" tabular color="ink">{`+${REST_STEP_SECONDS}`}</Text>
        </Pressable>
      </View>

      <Text variant="caption" color="inkSubtle" style={styles.legend}>
        Varsayılan mola
      </Text>
      <View style={styles.presets}>
        {REST_PRESETS.map((seconds) => {
          const selected = presetSeconds === seconds;
          return (
            <Pressable
              key={seconds}
              testID={`rest-preset-${seconds}`}
              onPress={() => controller.setPreset(seconds)}
              haptic="select"
              minTarget={false}
              accessibilityLabel={`${seconds} saniye`}
              accessibilityHint="Bu hareketin varsayılan molası olur"
              accessibilityState={{ selected }}
              style={[styles.preset, { backgroundColor: selected ? colors.primary : colors.surfaceMuted }]}
            >
              <Text variant="label" tabular style={{ color: selected ? colors.onPrimary : colors.inkMuted }}>
                {seconds}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Pressable
          testID="rest-mute"
          onPress={toggleMute}
          haptic="select"
          minTarget={false}
          accessibilityLabel={muted ? "Sesi aç" : "Sesi kapat"}
          accessibilityState={{ selected: muted }}
          style={[styles.mute, { backgroundColor: colors.surfaceMuted }]}
        >
          <Icon name={muted ? "volume-mute" : "volume-high"} size={20} color={muted ? "inkSubtle" : "inkMuted"} />
        </Pressable>

        <Pressable
          testID="rest-skip"
          onPress={() => controller.skip()}
          haptic="medium"
          minTarget={false}
          accessibilityLabel="Molayı geç"
          style={[styles.skip, { borderColor: colors.border }]}
        >
          <Text variant="bodyStrong" color="inkMuted">
            Molayı geç
          </Text>
          <Icon icon="skip" size={16} color="inkMuted" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

/**
 * The progress dial. It drains on its own clock — one linear animation retargeted whenever the
 * remaining time changes — so it sweeps smoothly instead of jumping once a second.
 */
function Dial({
  remaining,
  total,
  color,
  track,
  reduce,
  children,
}: {
  remaining: number;
  total: number;
  color: string;
  track: string;
  reduce: boolean;
  children: React.ReactNode;
}) {
  const r = (DIAL - DIAL_STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const left = useSharedValue(1);

  useEffect(() => {
    const fraction = total > 0 ? clamp(remaining / total, 0, 1) : 0;
    cancelAnimation(left);
    left.set(fraction);
    // Reduced motion: land on the value and stay there; the number carries the countdown.
    if (!reduce && remaining > 0) left.set(withTiming(0, { duration: remaining * 1000, easing: Easing.linear }));
  }, [left, reduce, remaining, total]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - left.get()) }));

  return (
    <View style={styles.dial}>
      <Svg width={DIAL} height={DIAL} style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Circle cx={DIAL / 2} cy={DIAL / 2} r={r} stroke={track} strokeWidth={DIAL_STROKE} fill="none" />
        <AnimatedCircle
          cx={DIAL / 2}
          cy={DIAL / 2}
          r={r}
          stroke={color}
          strokeWidth={DIAL_STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${DIAL / 2} ${DIAL / 2})`}
        />
      </Svg>
      <View style={styles.dialCenter} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg, gap: spacing.md },
  announcement: { position: "absolute", top: 0, left: 0, width: 1, height: 1, opacity: 0 },
  hero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  step: { width: 60, height: 60, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  dial: { width: DIAL, height: DIAL, alignItems: "center", justifyContent: "center" },
  dialCenter: { ...absoluteFill, alignItems: "center", justifyContent: "center", paddingHorizontal: DIAL_STROKE + 4 },
  legend: { marginBottom: -spacing.sm + 2 },
  presets: { flexDirection: "row", gap: spacing.xs + 2 },
  preset: { flex: 1, height: 44, borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mute: { width: 48, height: 48, borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
  skip: { flex: 1, minHeight: 48, borderRadius: radii.control, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
});
