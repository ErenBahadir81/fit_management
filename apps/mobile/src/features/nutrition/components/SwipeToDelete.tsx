import React, { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { haptic } from "../../../lib/haptics";
import { useTheme } from "../../../theme/ThemeProvider";
import { springs } from "../../../theme/motion";
import { spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Text } from "../../../ui/Text";

const ACTION_W = 88;
const THRESHOLD = 72;

/**
 * Swipe a row left to delete it. Everything runs in worklets on the UI thread; the JS side only
 * hears about the delete once the row has slid away (the screen then offers an undo).
 */
export function SwipeToDelete({ children, onDelete, enabled = true }: { children: React.ReactNode; onDelete: () => void; enabled?: boolean }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const x = useSharedValue(0);

  const fire = useCallback(() => {
    void haptic.medium();
    onDelete();
  }, [onDelete]);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = Math.min(0, Math.max(e.translationX, -ACTION_W - 40));
    })
    .onEnd(() => {
      if (x.value < -THRESHOLD) {
        x.value = withTiming(-ACTION_W - 200, { duration: reduce ? 100 : 180 }, (finished) => {
          if (finished) runOnJS(fire)();
        });
      } else {
        x.value = reduce ? withTiming(0, { duration: 120 }) : withSpring(0, springs.snappy);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const actionStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.abs(x.value) / THRESHOLD) }));

  return (
    <View style={styles.wrap}>
      <Animated.View pointerEvents="none" style={[styles.action, { backgroundColor: colors.danger }, actionStyle]}>
        <Icon name="trash-outline" size={20} color={colors.onPrimary} />
        <Text variant="caption" style={{ color: colors.onPrimary }}>
          Sil
        </Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  action: { position: "absolute", right: 0, top: 0, bottom: 0, width: ACTION_W, alignItems: "center", justifyContent: "center", gap: spacing.xxs },
});
