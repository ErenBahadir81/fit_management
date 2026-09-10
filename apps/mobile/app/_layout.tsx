import "react-native-gesture-handler";
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
  const { colors, isDark } = useTheme();

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
        <Stack.Protected guard={status === "signedIn"}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(modals)" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        </Stack.Protected>
        <Stack.Protected guard={status === "signedOut"}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
