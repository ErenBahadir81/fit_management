import { ProfileScreen } from "../../src/features/profile/ProfileScreen";

import { TabScene } from "../../src/ui/TabScene";
import { ScreenErrorBoundary } from "../../src/ui/ScreenErrorBoundary";

export default function ProfileRoute() {
  return (
    <ScreenErrorBoundary name="profile">
      <TabScene><ProfileScreen /></TabScene>
    </ScreenErrorBoundary>
  );
}
