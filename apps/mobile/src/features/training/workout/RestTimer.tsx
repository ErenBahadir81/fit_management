import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { spacing } from "../../../theme/tokens";
import { useTheme } from "../../../theme/ThemeProvider";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Ring } from "../../../ui/Ring";
import { Text } from "../../../ui/Text";

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export interface RestTimerProps {
  remaining: number;
  total: number;
  onSkip: () => void;
}

/** Rest chip with a pulsing ring. Tap anywhere to skip and go straight to the next set. */
export function RestTimer({ remaining, total, onSkip }: RestTimerProps) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduce) return;
    pulse.value = withRepeat(withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => {
      pulse.value = 1;
    };
  }, [pulse, reduce]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onSkip}
        haptic="select"
        testID="rest-timer"
        accessibilityLabel={`Dinlenme ${mmss(remaining)}, geçmek için dokun`}
        accessibilityLiveRegion="polite"
        style={[styles.chip, { backgroundColor: colors.primarySoft }]}
      >
        <Ring value={total > 0 ? remaining / total : 0} size={30} stroke={3} tone="primary" gradient={false} />
        <View style={styles.texts}>
          <Text variant="label" tone="primary" tabular>
            {mmss(remaining)}
          </Text>
          <Text variant="caption" color="inkMuted">
            dinlenme
          </Text>
        </View>
        <Icon name="play-skip-forward" size={16} color="primary" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999, minHeight: 48 },
  texts: { alignItems: "flex-start" },
});
