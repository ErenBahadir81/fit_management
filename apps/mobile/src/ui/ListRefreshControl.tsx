import React from "react";
import { RefreshControl } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export interface ListRefreshControlProps {
  refreshing: boolean;
  onRefresh: () => void;
  progressViewOffset?: number;
  /**
   * React Native Web's ScrollView renders itself *inside* the element passed as `refreshControl`
   * (`cloneElement(refreshControl, { style }, scrollView)`). A wrapper that drops `children`
   * therefore throws the whole list away — which is how the Program, Beslenme and Vücut tabs
   * rendered blank on web. Always forward them.
   */
  children?: React.ReactNode;
  style?: unknown;
}

/** Pull-to-refresh tinted like `Screen`'s — for list screens that render their own scroller. */
export function ListRefreshControl({ refreshing, onRefresh, progressViewOffset, children, style }: ListRefreshControlProps) {
  const { colors } = useTheme();
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary}
      colors={[colors.primary]}
      progressViewOffset={progressViewOffset}
      style={style as never}
    >
      {children}
    </RefreshControl>
  );
}
