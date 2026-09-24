import React, { createContext, useCallback, useContext } from "react";
import { RefreshControl, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
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

/** Height of the top bar that fades in behind the corner Floo once a tab screen scrolls. */
export const SCREEN_TOP_BAR = 60;

type ScrollHandler = (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
const ScreenScrollContext = createContext<ScrollHandler | null>(null);

/**
 * Inside `<Screen scroll={false}>` on a tab screen: the handler that feeds a vertical scroller's
 * offset to the screen's top bar. `List` attaches it by itself; call it from any other scroller's
 * `onScroll`. `null` elsewhere.
 */
export function useScreenScroll(): ScrollHandler | null {
  return useContext(ScreenScrollContext);
}

/**
 * Themed screen container: safe areas, gutters, pull-to-refresh, tab-bar clearance.
 *
 * On tab screens a flat top bar (the page colour plus a hairline) fades in as soon as content
 * moves, so rows never slide visibly underneath the corner Floo. At rest it is invisible: the large
 * title owns the top of the page. List screens (`scroll={false}`) get the same bar: `List` reports
 * its scroll through `useScreenScroll`. The bar is drawn inside the screen, under the corner Floo,
 * which lives one layer up (the tabs layout), so nothing a screen draws can cover Floo.
 */
export function Screen({ children, scroll = true, keyboard, refreshing, onRefresh, tabBar = true, edges = ["top"], style, contentStyle, testID, ...rest }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const padTop = edges.includes("top") ? insets.top + spacing.sm : 0;
  const padBottom = tabBar ? tabSpace + spacing.md : edges.includes("bottom") ? insets.bottom + spacing.lg : spacing.lg;
  const bg = { backgroundColor: colors.bg };

  if (!scroll) {
    return (
      <StaticBody testID={testID} style={[styles.flex, bg, { paddingTop: padTop }, style]} topBar={tabBar}>
        {children}
      </StaticBody>
    );
  }
  if (keyboard) {
    return (
      <KeyboardAwareScrollView
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
      </KeyboardAwareScrollView>
    );
  }
  return (
    <View style={[styles.flex, bg, style]}>
      <ScrollBody {...rest} testID={testID} refreshing={refreshing} onRefresh={onRefresh} padTop={padTop} padBottom={padBottom} contentStyle={contentStyle} topBar={tabBar}>
        {children}
      </ScrollBody>
    </View>
  );
}

interface ScrollBodyProps extends Omit<ScreenProps, "scroll" | "keyboard" | "tabBar" | "edges" | "style"> {
  padTop: number;
  padBottom: number;
  topBar: boolean;
}

/** A screen whose scroller is its child (a `List`): the list drives the top bar. */
function StaticBody({ children, topBar, testID, style }: { children: React.ReactNode; topBar: boolean; testID?: string; style: StyleProp<ViewStyle> }) {
  const y = useSharedValue(0);
  const onScroll = useCallback<ScrollHandler>((e) => y.set(e.nativeEvent.contentOffset.y), [y]);
  return (
    <View testID={testID} style={style}>
      <ScreenScrollContext.Provider value={topBar ? onScroll : null}>{children}</ScreenScrollContext.Provider>
      {topBar ? <TopBar y={y} /> : null}
    </View>
  );
}

function TopBar({ y }: { y: SharedValue<number> }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // 0 → 1 over the first 16 pt of scroll: quick enough that nothing is ever seen under Floo, and
  // tied to the scroll position (no clock), so it never lags behind or overshoots the content.
  const bar = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [0, 16], [0, 1], "clamp") }));
  return (
    <Animated.View
      pointerEvents="none"
      testID="screen-top-bar"
      style={[styles.topBar, { height: insets.top + SCREEN_TOP_BAR, backgroundColor: colors.bg, borderBottomColor: colors.border }, bar]}
    />
  );
}

function ScrollBody({ children, refreshing, onRefresh, padTop, padBottom, contentStyle, topBar, testID, ...rest }: ScrollBodyProps) {
  const { colors } = useTheme();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
  });
  return (
    <>
      <Animated.ScrollView
        {...rest}
        testID={testID}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: padTop, paddingBottom: padBottom }, contentStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressViewOffset={padTop} /> : undefined
        }
      >
        {children}
      </Animated.ScrollView>
      {topBar ? <TopBar y={y} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  content: { paddingHorizontal: spacing.gutter, gap: spacing.cardGap },
});
