import { useRouter } from "expo-router";
import { Floo } from "../../src/mascot/Floo";
import { EmptyState, Header, Screen } from "../../src/ui";

/** F3 replaces this with `src/features/nutrition/ScanScreen` (camera + AI overlay). Route: /(modals)/scan */
export default function ScanRoute() {
  const router = useRouter();
  return (
    <Screen tabBar={false} edges={["top", "bottom"]}>
      <Header title="Tara" compact left={{ icon: "close", label: "Kapat", onPress: () => router.back() }} />
      <EmptyState illustration={<Floo mood="think" size="m" />} title="Yakında" body="Kamera ile yemek tanıma burada olacak." />
    </Screen>
  );
}
