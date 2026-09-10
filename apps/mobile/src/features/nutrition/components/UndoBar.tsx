import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";
import { Text } from "../../../ui/Text";

/** "Silindi · Geri al" bar shown after a swipe-delete. The parent owns the 5 s lifetime. */
export function UndoBar({ message, onUndo, bottom }: { message: string; onUndo: () => void; bottom: number }) {
  const { colors, shadows } = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18).stiffness(220)}
      exiting={FadeOutDown.duration(160)}
      pointerEvents="box-none"
      style={[styles.host, { bottom }]}
    >
      <View style={[styles.bar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, shadows.elevated]}>
        <Icon name="trash-outline" size={16} color="inkMuted" />
        <Text variant="label" style={styles.text} numberOfLines={1}>
          {message}
        </Text>
        <Pressable testID="undo-delete" onPress={onUndo} haptic="select" minTarget={false} accessibilityLabel="Silmeyi geri al" style={styles.action}>
          <Text variant="label" color="primary">
            Geri al
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: spacing.gutter, right: spacing.gutter, alignItems: "center" },
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, minWidth: 240 },
  text: { flex: 1 },
  action: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, minHeight: 36, justifyContent: "center" },
});
