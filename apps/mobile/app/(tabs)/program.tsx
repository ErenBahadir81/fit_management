import { ProgramScreen } from "../../src/features/training";

/** Program tab: week strip, today's card, weekly volume, history — plus the recovery segment. */
import { ScreenErrorBoundary } from "../../src/ui/ScreenErrorBoundary";

export default function ProgramRoute() {
  return (
    <ScreenErrorBoundary name="program">
      <ProgramScreen />
    </ScreenErrorBoundary>
  );
}
