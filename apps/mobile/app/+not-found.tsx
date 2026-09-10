import { useRouter } from "expo-router";
import { Floo } from "../src/mascot/Floo";
import { EmptyState, Screen } from "../src/ui";

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen tabBar={false} edges={["top", "bottom"]} contentStyle={{ flexGrow: 1, justifyContent: "center" }}>
      <EmptyState illustration={<Floo mood="worried" size="m" />} title="Burada bir şey yok" body="Aradığın sayfa bulunamadı." action={{ label: "Ana sayfaya dön", onPress: () => router.replace("/(tabs)") }} />
    </Screen>
  );
}
