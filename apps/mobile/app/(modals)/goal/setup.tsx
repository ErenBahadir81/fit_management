import { useLocalSearchParams } from "expo-router";
import { GoalSetupScreen } from "../../../src/features/goals/GoalSetupScreen";

/** /(modals)/goal/setup?mode=edit — target slider + pace + live preview. */
export default function GoalSetupRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <GoalSetupScreen mode={mode === "edit" ? "edit" : "create"} />;
}
