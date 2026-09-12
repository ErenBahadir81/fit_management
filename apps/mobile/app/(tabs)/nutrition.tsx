import { NutritionScreen } from "../../src/features/nutrition/NutritionScreen";

/** Beslenme: day log (pager, calorie ring, meals) + week summary. */
import { TabScene } from "../../src/ui/TabScene";
import { ScreenErrorBoundary } from "../../src/ui/ScreenErrorBoundary";

export default function NutritionRoute() {
  return (
    <ScreenErrorBoundary name="nutrition">
      <TabScene><NutritionScreen /></TabScene>
    </ScreenErrorBoundary>
  );
}
