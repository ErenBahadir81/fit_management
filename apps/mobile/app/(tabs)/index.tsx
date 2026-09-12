import { HomeScreen } from "../../src/features/home/HomeScreen";

import { ScreenErrorBoundary } from "../../src/ui/ScreenErrorBoundary";

export default function HomeRoute() {
  return (
    <ScreenErrorBoundary name="index">
      <HomeScreen />
    </ScreenErrorBoundary>
  );
}
