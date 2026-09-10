import { Stack } from "expo-router";

/** Root layout — replaced by the mobile foundation agent (providers, theme, auth gate, tabs). */
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
