import React from "react";
import { RefreshControl, ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { spacing } from "../theme/tokens";
import { useTabBarSpace } from "./TabBar";

export interface ScreenProps extends Omit<ScrollViewProps, "style"> {
  children: React.ReactNode;
  /** Scrollable content (default true). Use false for FlashList screens. */
  scroll?: boolean;
  /** Keyboard-aware scroll (forms). */
  keyboard?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Reserve space for the floating tab bar (default true on tab screens). */
  tabBar?: boolean;
  /** Skip the top safe-area padding (when a header handles it). */
  edges?: ("top" | "bottom")[];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Themed screen container: safe areas, gutters, pull-to-refresh, tab-bar clearance. */
export function Screen({ children, scroll = true, keyboard, refreshing, onRefresh, tabBar = true, edges = ["top"], style, contentStyle, testID, ...rest }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const padTop = edges.includes("top") ? insets.top + spacing.sm : 0;
  const padBottom = tabBar ? tabSpace + spacing.md : edges.includes("bottom") ? insets.bottom + spacing.lg : spacing.lg;
  const bg = { backgroundColor: colors.bg };

  if (!scroll) {
    return (
      <View testID={testID} style={[styles.flex, bg, { paddingTop: padTop }, style]}>
        {children}
      </View>
    );
  }
  const Scroller = keyboard ? KeyboardAwareScrollView : ScrollView;
  return (
    <Scroller
      {...rest}
      testID={testID}
      style={[styles.flex, bg, style]}
      contentContainerStyle={[styles.content, { paddingTop: padTop, paddingBottom: padBottom }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressViewOffset={padTop} /> : undefined
      }
    >
      {children}
    </Scroller>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, gap: spacing.lg },
});
