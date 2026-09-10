import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { spacing } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export interface ListRowProps {
  label: string;
  value?: string;
  hint?: string;
  icon?: IconName;
  /** Custom trailing node (Toggle, Chip…). Replaces value + chevron. */
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Settings-style row: icon, label, value, chevron. */
export function ListRow({ label, value, hint, icon, right, onPress, chevron = Boolean(onPress), destructive, testID, style }: ListRowProps) {
  const { colors } = useTheme();
  const content = (
    <>
      {icon && (
        <View style={[styles.iconWrap, { backgroundColor: destructive ? colors.dangerSoft : colors.primarySoft }]}>
          <Icon name={icon} size={18} color={destructive ? "danger" : "primary"} />
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
          {chevron && <Icon name="chevron-forward" size={18} color="inkSubtle" />}
        </>
      )}
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

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1, gap: 2 },
  value: { maxWidth: "45%" },
});
