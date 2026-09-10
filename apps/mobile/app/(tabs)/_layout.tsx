import { Tabs } from "expo-router/js-tabs";
import { useTheme } from "../../src/theme";
import { RouterTabBar } from "../../src/ui/RouterTabBar";

/** Five product tabs with the custom floating tab bar. Feature agents fill program/nutrition/body. */
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs tabBar={(props) => <RouterTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, lazy: true }}>
      <Tabs.Screen name="index" options={{ title: "Ana Sayfa" }} />
      <Tabs.Screen name="program" options={{ title: "Program" }} />
      <Tabs.Screen name="nutrition" options={{ title: "Beslenme" }} />
      <Tabs.Screen name="body" options={{ title: "Vücut" }} />
      <Tabs.Screen name="profile" options={{ title: "Profil" }} />
    </Tabs>
  );
}
