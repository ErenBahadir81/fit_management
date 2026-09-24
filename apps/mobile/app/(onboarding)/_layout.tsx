import { Stack } from "expo-router";
import { useFlooPresence } from "../../src/mascot/voice";
import { useTheme } from "../../src/theme";

export default function OnboardingLayout() {
  const { colors } = useTheme();
  // The session has its own, big Floo; the corner one would be a second copy of the character.
  useFlooPresence("hidden");
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
