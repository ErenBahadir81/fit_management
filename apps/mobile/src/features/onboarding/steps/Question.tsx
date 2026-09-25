import React from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";
import { useDropIn } from "../components/Juice";

/**
 * One question inside a step: what it is, why it is asked, the control, and what is wrong. The
 * `index`-th question of a step drops in after the ones above it.
 */
export function Question({ title, why, error, index = 0, children }: { title: string; why?: string; error?: string; index?: number; children: React.ReactNode }) {
  const drop = useDropIn(index);
  return (
    <Animated.View style={[styles.block, drop]}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {why ? (
        <Text variant="caption" color="inkMuted">
          {why}
        </Text>
      ) : null}
      <View style={styles.body}>{children}</View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.xxs },
  body: { marginTop: spacing.sm },
});
