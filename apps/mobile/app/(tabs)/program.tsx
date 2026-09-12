import { ProgramScreen } from "../../src/features/training";

/** Program tab: week strip, today's card, weekly volume, history — plus the recovery segment. */
import { TabScene } from "../../src/ui/TabScene";
import { ScreenErrorBoundary } from "../../src/ui/ScreenErrorBoundary";

export default function ProgramRoute() {
  return (
    <ScreenErrorBoundary name="program">
      <TabScene><ProgramScreen /></TabScene>
    </ScreenErrorBoundary>
  );
}
