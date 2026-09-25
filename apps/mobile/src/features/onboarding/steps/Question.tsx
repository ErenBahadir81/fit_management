import React from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "../../../theme/tokens";
import { Text } from "../../../ui/Text";

/** One question inside a step: what it is, why it is asked, the control, and what is wrong. */
export function Question({ title, why, error, children }: { title: string; why?: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.xxs },
  body: { marginTop: spacing.sm },
});
