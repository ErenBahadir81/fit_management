import { Stack } from "expo-router";
import { useTheme } from "../../src/theme";

/** Full-screen flows (camera scan, workout logger). Presented as a modal over the tabs. */
export default function ModalsLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
