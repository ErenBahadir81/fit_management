import { useRouter } from "expo-router";
import { Floo } from "../../src/mascot/Floo";
import { EmptyState, Header, Screen } from "../../src/ui";

/** F2 replaces this with `src/features/training/WorkoutScreen` (set-by-set logger). Route: /(modals)/workout */
export default function WorkoutRoute() {
  const router = useRouter();
  return (
    <Screen tabBar={false} edges={["top", "bottom"]}>
      <Header title="Antrenman" compact left={{ icon: "close", label: "Kapat", onPress: () => router.back() }} />
      <EmptyState illustration={<Floo mood="flex" size="m" />} title="Yakında" body="Set set antrenman kaydı burada olacak." />
    </Screen>
  );
}
