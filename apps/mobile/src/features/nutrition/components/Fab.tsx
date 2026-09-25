import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";

export const FAB_SIZE = 60;

/**
 * The one primary action of the day screen: add something to the log.
 * `hidden` slides it below the edge while the list scrolls down, so it never sits on top of a row
 * the person is reading; scrolling back up brings it back.
 */
export function Fab({ onPress, bottom, hidden = false, testID = "nutrition-fab" }: { onPress: () => void; bottom: number; hidden?: boolean; testID?: string }) {
  const { colors, shadows } = useTheme();
  const reduced = useReducedMotion();
  const away = useSharedValue(hidden ? 1 : 0);
  useEffect(() => {
    away.value = reduced ? withTiming(hidden ? 1 : 0, { duration: 0 }) : hidden ? withTiming(1, { duration: 180 }) : withSpring(0, { damping: 18, stiffness: 260 });
  }, [away, hidden, reduced]);
  const motion = useAnimatedStyle(() => ({
    opacity: 1 - away.value,
    transform: [{ translateY: away.value * (FAB_SIZE + bottom) }, { scale: 1 - away.value * 0.4 }],
  }));
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} testID={`${testID}-host`} pointerEvents={hidden ? "none" : "box-none"} style={[styles.host, { bottom }, motion]}>
      <Pressable testID={testID} onPress={onPress} haptic="medium" minTarget={false} accessibilityLabel="Öğün ekle" style={[styles.fab, { backgroundColor: colors.primary }, shadows.primary]}>
        <View style={styles.center}>
          <Icon icon="add" size={30} color={colors.onPrimary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", right: spacing.gutter },
  fab: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center" },
});
