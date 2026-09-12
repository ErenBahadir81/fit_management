import { HomeScreen } from "../../src/features/home/HomeScreen";

import { TabScene } from "../../src/ui/TabScene";
import { ScreenErrorBoundary } from "../../src/ui/ScreenErrorBoundary";

export default function HomeRoute() {
  return (
    <ScreenErrorBoundary name="index">
      <TabScene><HomeScreen /></TabScene>
    </ScreenErrorBoundary>
  );
}
