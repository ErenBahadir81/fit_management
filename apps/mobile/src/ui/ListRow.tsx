import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radii, spacing } from "../theme/tokens";
import { Icon } from "./Icon";
import { resolveGlyph, type IconGlyph } from "./icons";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export interface ListRowProps {
  label: string;
  value?: string;
  hint?: string;
  icon?: IconGlyph;
  /** Custom trailing node (Toggle, Chip…). Replaces value + chevron. */
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  /**
   * Draw a hairline under the row, starting at the text column (iOS grouped-list style). Pass it on
   * every row but the last of a group: `divider={i < rows.length - 1}`.
   */
  divider?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Settings-style row: icon, label, value, chevron. At least `spacing.rowMin` tall. */
export function ListRow({ label, value, hint, icon, right, onPress, chevron = Boolean(onPress), destructive, divider, testID, style }: ListRowProps) {
  const { colors } = useTheme();
  const content = (
    <>
      {icon && (
        <View style={[styles.iconWrap, { backgroundColor: destructive ? colors.dangerSoft : colors.primarySoft }]}>
          <Icon name={resolveGlyph(icon)} size={18} color={destructive ? "danger" : "primary"} />
        </View>
      )}
      <View style={styles.texts}>
        <Text variant="bodyStrong" tone={destructive ? "danger" : undefined} numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color="inkMuted" numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
      </View>
      {right ?? (
        <>
          {value ? (
            <Text variant="body" color="inkMuted" tabular numberOfLines={1} style={styles.value}>
              {value}
            </Text>
          ) : null}
          {chevron && <Icon icon="forward" size={18} color="inkSubtle" />}
        </>
      )}
      {divider ? <View testID={testID ? `${testID}-divider` : undefined} style={[styles.divider, { backgroundColor: colors.border, left: icon ? ICON + spacing.md : 0 }]} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} style={[styles.row, style]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityLabel={value ? `${label}, ${value}` : label} scaleTo={0.985} style={[styles.row, style]}>
      {content}
    </Pressable>
  );
}

const ICON = 32;

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: spacing.rowMin, paddingVertical: spacing.sm },
  iconWrap: { width: ICON, height: ICON, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  divider: { position: "absolute", right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  texts: { flex: 1, gap: 2 },
  value: { maxWidth: "45%" },
});
