import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radii, spacing } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export interface HeaderAction {
  icon: IconName;
  onPress: () => void;
  label: string;
  testID?: string;
}
export interface HeaderProps extends ViewProps {
  title: string;
  subtitle?: string;
  /** Small text above the title (e.g. greeting or date). */
  eyebrow?: string;
  left?: HeaderAction;
  right?: HeaderAction;
  /** Compact = 22 pt title in a row (sheets/modals); default = large 28 pt title. */
  compact?: boolean;
  /** Custom node on the right (e.g. mascot avatar). */
  trailing?: React.ReactNode;
}

function IconButton({ action }: { action: HeaderAction }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={action.onPress}
      accessibilityLabel={action.label}
      testID={action.testID}
      haptic="select"
      style={[styles.iconBtn, { backgroundColor: colors.surfaceMuted }]}
    >
      <Icon name={action.icon} size={20} color="ink" />
    </Pressable>
  );
}

/** Screen header. Large title by default; one optional action each side. */
export function Header({ title, subtitle, eyebrow, left, right, compact, trailing, style, ...rest }: HeaderProps) {
  return (
    <View {...rest} style={[styles.wrap, style]}>
      {left && <IconButton action={left} />}
      <View style={styles.texts}>
        {eyebrow ? (
          <Text variant="label" color="inkMuted">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant={compact ? "heading" : "display"} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" color="inkMuted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {right && <IconButton action={right} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  texts: { flex: 1, gap: 2 },
  iconBtn: { width: 44, height: 44, borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
});
