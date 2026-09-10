import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { spacing } from "../theme/tokens";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export interface EmptyStateProps extends ViewProps {
  title: string;
  body?: string;
  icon?: IconName;
  /** Custom illustration — pass `<Floo mood="sleepy" size="m" />` from features. */
  illustration?: React.ReactNode;
  action?: { label: string; onPress: () => void; icon?: IconName };
  compact?: boolean;
}

/** Empty / error state with one clear next step. */
export function EmptyState({ title, body, icon = "sparkles", illustration, action, compact, style, ...rest }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View {...rest} style={[styles.wrap, compact && styles.compact, style]}>
      {illustration ?? (
        <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
          <Icon name={icon} size={28} color="primary" />
        </View>
      )}
      <Text variant="title" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="inkMuted" align="center" style={styles.body}>
          {body}
        </Text>
      ) : null}
      {action && <Button label={action.label} onPress={action.onPress} icon={action.icon} variant="secondary" style={styles.action} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: spacing.huge, paddingHorizontal: spacing.xxl, gap: spacing.md },
  compact: { paddingVertical: spacing.xxl },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  body: { maxWidth: 300 },
  action: { marginTop: spacing.sm },
});
