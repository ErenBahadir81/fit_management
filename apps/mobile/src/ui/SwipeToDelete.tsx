import React, { useCallback, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { haptic } from "../lib/haptics";
import { useTheme } from "../theme/ThemeProvider";
import { springs } from "../theme/motion";
import { radii, spacing } from "../theme/tokens";
import { Icon } from "./Icon";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export const SWIPE_ACTION_WIDTH = 88;
/** Past this the swipe commits on release without a tap on the action. */
const FULL_SWIPE_FRACTION = 0.55;
const OPEN_THRESHOLD = SWIPE_ACTION_WIDTH * 0.45;
const FLING_VELOCITY = -900;

export interface SwipeToDeleteProps {
  children: React.ReactNode;
  onDelete: () => void;
  enabled?: boolean;
  /** Test id of the revealed action button (the row keeps its own). */
  deleteTestID?: string;
  /** Spoken name of the action, e.g. "Kaydı sil". */
  deleteLabel?: string;
  /** Radius of the revealed action (match the row). */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The one swipe-to-delete. Drag a row left: a short swipe snaps it open on a tappable "Sil"
 * action, a long swipe (or a fling) commits at once. Everything moves on the UI thread; JS only
 * hears about the delete once the row has left (the screen then offers an undo bar).
 * The action stays in the accessibility tree so screen readers and tests can reach it directly.
 */
export function SwipeToDelete({ children, onDelete, enabled = true, deleteTestID, deleteLabel = "Sil", radius = radii.md, style }: SwipeToDeleteProps) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const start = useSharedValue(0);

  const fire = useCallback(() => {
    void haptic.medium();
    onDelete();
  }, [onDelete]);

  const commit = useCallback(() => {
    x.set(withTiming(-Math.max(width, SWIPE_ACTION_WIDTH) - 80, { duration: reduce ? 100 : 180 }, (finished) => {
      if (finished) runOnJS(fire)();
    }));
  }, [fire, reduce, width, x]);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      start.set(x.get());
    })
    .onUpdate((e) => {
      x.set(Math.min(0, Math.max(start.get() + e.translationX, -width)));
    })
    .onEnd((e) => {
      const full = -Math.max(SWIPE_ACTION_WIDTH * 2, width * FULL_SWIPE_FRACTION);
      const current = x.get();
      if (current < full || e.velocityX < FLING_VELOCITY) {
        x.set(
          withTiming(-width - 80, { duration: reduce ? 100 : 180 }, (finished) => {
            if (finished) runOnJS(fire)();
          })
        );
      } else if (current < -OPEN_THRESHOLD) {
        x.set(reduce ? withTiming(-SWIPE_ACTION_WIDTH, { duration: 120 }) : withSpring(-SWIPE_ACTION_WIDTH, springs.snappy));
      } else {
        x.set(reduce ? withTiming(0, { duration: 120 }) : withSpring(0, springs.snappy));
      }
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const actionStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.abs(x.get()) / OPEN_THRESHOLD) }));

  return (
    <View style={[styles.wrap, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.row, rowStyle]}>{children}</Animated.View>
      </GestureDetector>
      <Animated.View style={[styles.action, actionStyle]}>
        <Pressable
          onPress={commit}
          haptic="none"
          testID={deleteTestID}
          accessibilityLabel={deleteLabel}
          minTarget={false}
          style={[styles.actionButton, { backgroundColor: colors.danger, borderRadius: radius }]}
        >
          <Icon name="trash-outline" size={20} color="onPrimary" />
          <Text variant="caption" color="onPrimary">
            Sil
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  row: { zIndex: 1 },
  action: { position: "absolute", right: 0, top: 0, bottom: 0, width: SWIPE_ACTION_WIDTH, zIndex: 0 },
  actionButton: { flex: 1, marginLeft: spacing.sm, alignItems: "center", justifyContent: "center", gap: 2 },
});
