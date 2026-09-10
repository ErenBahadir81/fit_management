import React from "react";
import { RefreshControl } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

/** Pull-to-refresh tinted like `Screen`'s — for FlashList / ScrollView screens that render their own list. */
export function ListRefreshControl({ refreshing, onRefresh, progressViewOffset }: { refreshing: boolean; onRefresh: () => void; progressViewOffset?: number }) {
  const { colors } = useTheme();
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressViewOffset={progressViewOffset} />;
}
