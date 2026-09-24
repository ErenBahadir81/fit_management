import { Stack } from "expo-router";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { FlooCornerHost } from "../../src/mascot/voice";
import { useTheme } from "../../src/theme";

/**
 * Full-screen flows (camera scan, workout logger). Presented as a modal over the tabs.
 *
 * The provider is repeated here on purpose. `BottomSheetModal` renders into the *nearest*
 * `BottomSheetModalProvider`, and the root one (`app/_layout.tsx`) lives outside these screens —
 * which the native stack presents as a `fullScreenModal`, i.e. its own UIViewController on top of
 * the window. A sheet opened from here would portal into the root host and land *underneath* that
 * native modal: it presents, no error is thrown, and nothing is visible — the flow just stops.
 * Hosting the portal inside the modal stack keeps the sheet on top of the screen that opened it.
 */
export default function ModalsLayout() {
  const { colors } = useTheme();
  return (
    <BottomSheetModalProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      {/* Inside the modal's own view controller, so Floo can speak over the flow (see FlooCornerHost). */}
      <FlooCornerHost presence="auto" />
    </BottomSheetModalProvider>
  );
}
