import React, { useCallback } from "react";
import type { Tabs } from "expo-router/js-tabs";
import { TAB_ITEMS, TabBar, tabIndexForRoute } from "./TabBar";

type TabBarRenderProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** Adapter: react-navigation tab-bar props → our animated `TabBar`. Pass to `<Tabs tabBar={...}>`. */
export function RouterTabBar({ state, navigation }: TabBarRenderProps) {
  const activeIndex = tabIndexForRoute(state.routes[state.index]?.name ?? "index");
  const onChange = useCallback(
    (i: number) => {
      const name = TAB_ITEMS[i]?.name;
      const route = state.routes.find((r) => r.name === name);
      if (!route) return;
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!event.defaultPrevented) navigation.navigate(route.name);
    },
    [navigation, state.routes]
  );
  return <TabBar activeIndex={activeIndex} onChange={onChange} />;
}
