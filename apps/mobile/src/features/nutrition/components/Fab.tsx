import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTheme } from "../../../theme/ThemeProvider";
import { radii, spacing } from "../../../theme/tokens";
import { Icon } from "../../../ui/Icon";
import { Pressable } from "../../../ui/Pressable";

export const FAB_SIZE = 60;

/** The one primary action of the day screen: add something to the log. */
export function Fab({ onPress, bottom, testID = "nutrition-fab" }: { onPress: () => void; bottom: number; testID?: string }) {
  const { colors, shadows } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} pointerEvents="box-none" style={[styles.host, { bottom }]}>
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
