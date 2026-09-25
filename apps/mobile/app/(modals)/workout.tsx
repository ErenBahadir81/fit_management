import { useLocalSearchParams } from "expo-router";
import { WorkoutScreen } from "../../src/features/training";

/**
 * Full-screen set-by-set workout logger. Route: `/(modals)/workout`.
 * `?dayId=d3` logs that program day instead of today's planned one; `&resumePlanned=1` keeps the
 * planned day next in the cycle.
 */
export default function WorkoutRoute() {
  const { dayId, resumePlanned } = useLocalSearchParams<{ dayId?: string; resumePlanned?: string }>();
  return <WorkoutScreen dayId={typeof dayId === "string" && dayId ? dayId : null} resumePlanned={resumePlanned === "1"} />;
}
