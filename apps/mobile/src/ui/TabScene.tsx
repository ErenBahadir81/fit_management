import React from "react";
import { Platform } from "react-native";
import { useIsFocused } from "expo-router";

/**
 * Renders a tab's content only while that tab is focused — on web only.
 *
 * react-navigation keeps every visited tab mounted. On native `react-native-screens` hides the
 * inactive ones; on web it is a no-op, so screens pile up and paint over each other (switching to
 * Program left Profil visible underneath). Native keeps the mounted-and-hidden behaviour, which is
 * what makes tab switches instant there.
 */
export function TabScene({ children }: { children: React.ReactNode }) {
  const focused = useIsFocused();
  if (Platform.OS === "web" && !focused) return null;
  return <>{children}</>;
}
