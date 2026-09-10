import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../context";

/**
 * VISION module — the Node side is just the client (`./client.ts`, used by the nutrition module's scan route
 * and by the admin health endpoint). The Python service lives in apps/vision (owner: B5).
 */
export async function registerVisionModule(_app: FastifyInstance, _ctx: AppContext) {
  // no routes: scan lives under /nutrition/scan (B4); health under /admin/system/health (B1)
}
export { createVisionClient, mockAnalysis, MOCK_LABELS, VisionUnavailableError } from "./client";
export type { VisionAnalysis, VisionClient, VisionDetection, VisionHealth } from "./client";
