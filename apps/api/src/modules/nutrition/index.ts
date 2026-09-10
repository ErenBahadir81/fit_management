import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../context";
import { foodsRoutes } from "./foods.routes";
import { scanRoutes } from "./scan.routes";
import { adminFoodsRoutes } from "./admin.routes";

/**
 * NUTRITION module (owner: B4) — foods catalogue + search + barcode, meal log, day/week views,
 * diet targets, the AI scan pipeline and the admin foods/scans endpoints.
 */
export async function registerNutritionModule(app: FastifyInstance, ctx: AppContext) {
  await app.register(async (scope) => foodsRoutes(scope, ctx));
  await app.register(async (scope) => scanRoutes(scope, ctx));
  await app.register(async (scope) => adminFoodsRoutes(scope, ctx));
}

export { seedFoods, buildSeedFoods, SEED_FOODS_TR, SEED_FOODS_FOOD101 } from "./seed/index";
export { offSearch, offBarcode, normalizeOffProduct, parseServingSize } from "./off";
export { usdaSearch, normalizeUsdaFood } from "./usda";
export { runScan, prepareImage, filterDetections, resolveFoodsForLabels } from "./scan.service";
export { scanImageUrl } from "./uploads";
export { resolveTarget } from "./target.service";
export { dayView, weekView } from "./entries.service";
export { searchLocalFoods, recentFoods } from "./foods.service";
