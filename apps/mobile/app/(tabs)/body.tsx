import { BodyScreen } from "../../src/features/body/BodyScreen";

import { TabScene } from "../../src/ui/TabScene";
import { ScreenErrorBoundary } from "../../src/ui/ScreenErrorBoundary";

export default function BodyRoute() {
  return (
    <ScreenErrorBoundary name="body">
      <TabScene><BodyScreen /></TabScene>
    </ScreenErrorBoundary>
  );
}
