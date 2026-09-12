import { ProfileScreen } from "../../src/features/profile/ProfileScreen";

import { ScreenErrorBoundary } from "../../src/ui/ScreenErrorBoundary";

export default function ProfileRoute() {
  return (
    <ScreenErrorBoundary name="profile">
      <ProfileScreen />
    </ScreenErrorBoundary>
  );
}
