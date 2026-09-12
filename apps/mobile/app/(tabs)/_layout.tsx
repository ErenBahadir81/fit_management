import { Platform } from "react-native";
import { Tabs } from "expo-router/js-tabs";
import { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "../../src/theme";
import { durations } from "../../src/theme/motion";
import { RouterTabBar } from "../../src/ui/RouterTabBar";

/** Five product tabs with the custom floating tab bar. Scenes shift sideways on switch (fade under reduced motion). */
export default function TabsLayout() {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  return (
    <Tabs
      tabBar={(props) => <RouterTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        lazy: true,
        freezeOnBlur: true,
        // Web: react-navigation keeps inactive scenes mounted and the "shift" animation leaves
        // them painted on top of each other, so screens visibly overlap. No animation there.
        animation: Platform.OS === "web" ? "none" : reduce ? "fade" : "shift",
        transitionSpec: { animation: "timing", config: { duration: reduce ? 150 : durations.base } },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Ana Sayfa" }} />
      <Tabs.Screen name="program" options={{ title: "Program" }} />
      <Tabs.Screen name="nutrition" options={{ title: "Beslenme" }} />
      <Tabs.Screen name="body" options={{ title: "Vücut" }} />
      <Tabs.Screen name="profile" options={{ title: "Profil" }} />
    </Tabs>
  );
}
