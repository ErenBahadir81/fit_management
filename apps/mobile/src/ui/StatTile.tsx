import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radii, spacing, type Tone } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export interface StatTileProps extends ViewProps {
  label: string;
  value: string;
  hint?: string;
  icon?: IconName;
  tone?: Tone;
}

/** Compact number tile (streaks, deltas). Value is tabular. */
export function StatTile({ label, value, hint, icon, tone, style, ...rest }: StatTileProps) {
  const { colors } = useTheme();
  return (
    <View {...rest} style={[styles.tile, { backgroundColor: colors.surfaceMuted }, style]} accessibilityLabel={`${label}: ${value}${hint ? ` ${hint}` : ""}`}>
      <View style={styles.head}>
        {icon && <Icon name={icon} size={14} color={tone ?? "inkMuted"} />}
        <Text variant="caption" color="inkMuted" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.valueRow}>
        <Text variant="heading" tabular tone={tone} numberOfLines={1}>
          {value}
        </Text>
        {hint ? (
          <Text variant="caption" color="inkSubtle">
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs },
});
