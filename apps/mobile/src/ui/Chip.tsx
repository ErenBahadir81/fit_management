import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radii, spacing, type Tone } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Pressable, type PressableProps } from "./Pressable";
import { Text } from "./Text";

export interface ChipProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  selected?: boolean;
  tone?: Tone;
  icon?: IconName;
  /** Small colored dot (e.g. muscle color). */
  dot?: string;
  size?: "sm" | "md";
}

/** Pill for filters, pickers and statuses. Selected = solid primary. */
export function Chip({ label, selected, tone = "neutral", icon, dot, size = "md", onPress, disabled, testID, ...rest }: ChipProps) {
  const { colors } = useTheme();
  const soft = { primary: colors.primarySoft, success: colors.successSoft, warning: colors.warningSoft, danger: colors.dangerSoft, neutral: colors.surfaceMuted }[tone];
  const fg = { primary: colors.primary, success: colors.success, warning: colors.warning, danger: colors.danger, neutral: colors.inkMuted }[tone];
  const bg = selected ? colors.primary : soft;
  const color = selected ? colors.onPrimary : fg;
  const h = size === "sm" ? 30 : 38;

  const body = (
    <View style={[styles.row, { height: h, paddingHorizontal: size === "sm" ? spacing.md : spacing.lg, backgroundColor: bg }]}>
      {dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} color={color} />}
      <Text variant="label" style={{ color }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={styles.wrap} accessibilityState={{ selected: Boolean(selected) }}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      {...rest}
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      haptic="select"
      minTarget={false}
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      accessibilityLabel={rest.accessibilityLabel ?? label}
      style={styles.wrap}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radii.pill, overflow: "hidden", alignSelf: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2, borderRadius: radii.pill },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
