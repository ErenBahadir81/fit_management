import React, { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "../lib/haptics";
import { useTheme } from "../theme/ThemeProvider";
import { springs, timing } from "../theme/motion";
import { radii, spacing } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export interface TabItem {
  /** expo-router route name inside `(tabs)`. */
  name: string;
  label: string;
  icon: IconName;
  iconActive: IconName;
}

export const TAB_ITEMS: readonly TabItem[] = [
  { name: "index", label: "Ana Sayfa", icon: "home-outline", iconActive: "home" },
  { name: "program", label: "Program", icon: "barbell-outline", iconActive: "barbell" },
  { name: "nutrition", label: "Beslenme", icon: "restaurant-outline", iconActive: "restaurant" },
  { name: "body", label: "Vücut", icon: "body-outline", iconActive: "body" },
  { name: "profile", label: "Profil", icon: "person-outline", iconActive: "person" },
];

export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_MARGIN = spacing.lg;

export function tabIndexForRoute(name: string): number {
  const i = TAB_ITEMS.findIndex((t) => t.name === name);
  return i === -1 ? 0 : i;
}

/** Space a scrolling screen must reserve at the bottom so content clears the floating bar. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + TAB_BAR_MARGIN + Math.max(insets.bottom, spacing.sm);
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

/** Floating pill tab bar: the indicator slides with a spring, switching gives a selection haptic. */
export function TabBar({ activeIndex, onChange, items = TAB_ITEMS, width, insetBottom }: TabBarProps) {
  const { colors, shadows } = useTheme();
  const dims = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const barWidth = (width ?? dims.width) - spacing.gutter * 2;
  const tabWidth = barWidth / items.length;
  const x = useSharedValue(activeIndex * tabWidth);
  useEffect(() => {
    x.value = reduce ? withTiming(activeIndex * tabWidth, timing.reduced) : withSpring(activeIndex * tabWidth, springs.snappy);
  }, [activeIndex, tabWidth, reduce, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const bottom = (insetBottom ?? Math.max(insets.bottom, spacing.sm)) + 0;

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom, paddingHorizontal: spacing.gutter }]}>
      <View
        accessibilityRole="tablist"
        style={[styles.bar, { width: barWidth, backgroundColor: colors.tabBar, borderColor: colors.border }, shadows.elevated]}
      >
        <Animated.View testID="tabbar-pill" pointerEvents="none" style={[styles.pill, { width: tabWidth - 8, backgroundColor: colors.primarySoft }, pill]} />
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
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              testID={`tab-${item.name}`}
              style={[styles.tab, { width: tabWidth }]}
            >
              <TabIcon name={active ? item.iconActive : item.icon} active={active} />
              <Text variant="caption" color={active ? "primary" : "inkMuted"} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TabIcon({ name, active }: { name: IconName; active: boolean }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(active ? 1 : 0.92);
  useEffect(() => {
    s.value = reduce ? withTiming(active ? 1 : 0.92, timing.reduced) : withSpring(active ? 1.08 : 0.92, springs.bouncy);
  }, [active, reduce, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={style}>
      <Icon name={name} size={22} color={active ? "primary" : "inkMuted"} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  bar: { height: TAB_BAR_HEIGHT, borderRadius: radii.pill, flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  pill: { position: "absolute", left: 4, top: 6, bottom: 6, borderRadius: radii.pill },
  tab: { height: TAB_BAR_HEIGHT, alignItems: "center", justifyContent: "center", gap: 2 },
});
