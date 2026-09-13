import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useSession } from "../src/features/auth/session";
import { needsOnboarding } from "../src/features/onboarding/api";
import { AppQueryProvider } from "../src/lib/queryClient";
import { ThemeProvider, useTheme } from "../src/theme";
import { ToastProvider } from "../src/ui/Toast";

void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Root: providers + auth-gated navigator. Tabs render instantly from the cached session (cache-first). */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ThemeProvider>
            <AppQueryProvider>
              <BottomSheetModalProvider>
                <ToastProvider>
                  <RootNavigator />
                </ToastProvider>
              </BottomSheetModalProvider>
            </AppQueryProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const { colors, isDark } = useTheme();
  // A brand-new account owes us the first-run flow before it may see the tabs. Only an explicit
  // `false` counts, so an account from a server that predates the field is never sent back through it.
  const inOnboarding = status === "signedIn" && needsOnboarding(user);

  useEffect(() => {
    void useSession.getState().boot();
  }, []);
  useEffect(() => {
    if (status !== "booting") void SplashScreen.hideAsync().catch(() => {});
  }, [status]);

  if (status === "booting") return null; // splash stays up (< 1 frame with a cached session)

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={status === "signedIn" && !inOnboarding}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(modals)" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        </Stack.Protected>
        {/* Reachable while signed out (welcome + sign-up) and while an account is still incomplete. */}
        <Stack.Protected guard={status === "signedOut" || inOnboarding}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={status === "signedOut"}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
