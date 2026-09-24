import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useTheme } from "../../../theme/ThemeProvider";
import { springs, timing } from "../../../theme/motion";
import { absoluteFill, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";
import { STAGE_COUNT } from "../model";

/** What each stage of the bar is called, read out with "Adım n/7". */
export const STAGE_LABEL = ["İsmin", "Sen", "Ölçüler", "Antrenman", "Durumun", "Hedefin", "Hazır"] as const;

/**
 * The session's progress, in its own language: seven short segments that fill one by one, each
 * springing full as its stage is reached, plus the stage name. Back sits on the left,
 * always in the same place, so nobody feels trapped.
 */
export function SessionProgress({ stage, onBack }: { stage: number; onBack: (() => void) | null }) {
  const { colors } = useTheme();
  const label = STAGE_LABEL[Math.max(0, Math.min(STAGE_COUNT, stage) - 1)];
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onBack ?? undefined}
        disabled={!onBack}
        accessibilityLabel="Geri"
        accessibilityRole="button"
        testID="onboarding-back"
        style={[styles.back, { backgroundColor: colors.surfaceMuted, opacity: onBack ? 1 : 0 }]}
      >
        <Icon icon="back" size={20} color="ink" />
      </Pressable>
      <View
        style={styles.bar}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Adım ${stage} / ${STAGE_COUNT}: ${label}`}
        accessibilityValue={{ min: 0, max: STAGE_COUNT, now: stage }}
        testID="onboarding-progress"
      >
        {Array.from({ length: STAGE_COUNT }, (_, i) => (
          <Segment key={i} filled={i < stage} />
        ))}
      </View>
      <View style={styles.count}>
        <Text variant="label" color="inkMuted" tabular testID="onboarding-step-count">
          {stage}/{STAGE_COUNT}
        </Text>
      </View>
    </View>
  );
}

function Segment({ filled }: { filled: boolean }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const v = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    v.set(reduce ? withTiming(filled ? 1 : 0, timing.reduced) : withSpring(filled ? 1 : 0, springs.gentle));
  }, [filled, reduce, v]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: v.get() }] }));
  return (
    <View style={[styles.segment, { backgroundColor: colors.ringTrack }]}>
      <Animated.View style={[styles.fill, { backgroundColor: colors.primary }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: spacing.touch },
  back: { width: spacing.touch, height: spacing.touch, borderRadius: spacing.touch / 2, alignItems: "center", justifyContent: "center" },
  bar: { flex: 1, flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  // scaleX from the left edge: the segment fills in the reading direction.
  fill: { ...absoluteFill, borderRadius: 3, transformOrigin: "left" },
  count: { minWidth: 28, alignItems: "flex-end" },
});
