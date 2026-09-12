import { BodyScreen } from "../../src/features/body/BodyScreen";

import { ScreenErrorBoundary } from "../../src/ui/ScreenErrorBoundary";

export default function BodyRoute() {
  return (
    <ScreenErrorBoundary name="body">
      <BodyScreen />
    </ScreenErrorBoundary>
  );
}
