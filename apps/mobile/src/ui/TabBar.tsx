import React, { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "../lib/haptics";
import { useTheme } from "../theme/ThemeProvider";
import { springs, timing } from "../theme/motion";
import { radii, spacing } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { APP_ICONS, type AppIcon } from "./icons";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export interface TabItem {
  /** expo-router route name inside `(tabs)`. */
  name: string;
  label: string;
  icon: IconName;
  iconActive: IconName;
}

function tab(name: string, label: string, icon: AppIcon): TabItem {
  return { name, label, icon: APP_ICONS[icon].name, iconActive: APP_ICONS[icon].active };
}

/** Glyphs come from the semantic map, so the bar can never drift from the rest of the app. */
export const TAB_ITEMS: readonly TabItem[] = [
  tab("index", "Ana Sayfa", "home"),
  tab("program", "Program", "program"),
  tab("nutrition", "Beslenme", "nutrition"),
  tab("body", "Vücut", "body"),
  tab("profile", "Profil", "profile"),
];

export const TAB_BAR_HEIGHT = 56;
/** Kept for callers that pad by it; the bar is docked now, so there is no margin under it. */
export const TAB_BAR_MARGIN = 0;
/** The pill behind the active icon (Material-style indicator, not a whole-tab highlight). */
const PILL_WIDTH = 56;
const PILL_HEIGHT = 30;

export function tabIndexForRoute(name: string): number {
  const i = TAB_ITEMS.findIndex((t) => t.name === name);
  return i === -1 ? 0 : i;
}

/** Space a scrolling screen must reserve at the bottom so content clears the tab bar. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, spacing.xs);
}

export interface TabBarProps {
  activeIndex: number;
  onChange: (index: number) => void;
  items?: readonly TabItem[];
  /** Window width override (tests). */
  width?: number;
  /** Bottom inset override (tests). */
  insetBottom?: number;
}

/**
 * Docked, flat tab bar: opaque surface, one hairline on top, no float and no glow. The active tab
 * gets a soft pill behind its icon that slides over with a spring, the filled glyph and the primary
 * label; switching gives a selection haptic.
 */
export function TabBar({ activeIndex, onChange, items = TAB_ITEMS, width, insetBottom }: TabBarProps) {
  const { colors } = useTheme();
  const dims = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const barWidth = width ?? dims.width;
  const tabWidth = barWidth / items.length;
  const pillX = (i: number) => i * tabWidth + (tabWidth - PILL_WIDTH) / 2;
  const x = useSharedValue(pillX(activeIndex));
  useEffect(() => {
    const to = activeIndex * tabWidth + (tabWidth - PILL_WIDTH) / 2;
    x.set(reduce ? withTiming(to, timing.reduced) : withSpring(to, springs.snappy));
  }, [activeIndex, tabWidth, reduce, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const bottom = insetBottom ?? Math.max(insets.bottom, spacing.xs);

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { paddingBottom: bottom, backgroundColor: colors.tabBar, borderTopColor: colors.tabBarBorder }]}
    >
      <Animated.View testID="tabbar-pill" pointerEvents="none" style={[styles.pill, { backgroundColor: colors.primarySoft }, pill]} />
      {items.map((item, i) => {
        const active = i === activeIndex;
        return (
          <Pressable
            key={item.name}
            onPress={() => {
              if (active) return;
              void haptic.select();
              onChange(i);
            }}
            haptic="none"
            scaleTo={0.94}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            testID={`tab-${item.name}`}
            style={[styles.tab, { width: tabWidth }]}
          >
            <TabIcon name={active ? item.iconActive : item.icon} active={active} />
            <Text variant="caption" color={active ? "primary" : "inkSubtle"} style={active ? styles.labelActive : undefined} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The icon lifts a touch when it becomes active (1 → 1.04) and settles back when it leaves. Tabs
 * switch dozens of times a day, so it is the snappy spring, not a bouncy one: no wobble to wait for.
 */
function TabIcon({ name, active }: { name: IconName; active: boolean }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(active && !reduce ? 1.04 : 1);
  useEffect(() => {
    s.set(reduce ? withTiming(1, timing.reduced) : withSpring(active ? 1.04 : 1, springs.snappy));
  }, [active, reduce, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <Animated.View style={[styles.icon, style]}>
      <Icon name={name} size={22} color={active ? "primary" : "inkSubtle"} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  pill: { position: "absolute", left: 0, top: 6, width: PILL_WIDTH, height: PILL_HEIGHT, borderRadius: radii.pill },
  tab: { height: TAB_BAR_HEIGHT, alignItems: "center", justifyContent: "flex-start", paddingTop: 6, gap: 2 },
  icon: { height: PILL_HEIGHT, justifyContent: "center" },
  labelActive: { fontWeight: "700" },
});
