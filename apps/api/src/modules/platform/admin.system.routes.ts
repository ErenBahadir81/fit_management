import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { SystemHealth } from "@fitfloow/core";
import { dbState } from "../../db";
import { createVisionClient } from "../vision/index";
import type { AppContext } from "../../context";

const startedAt = Date.now();

/** `version` comes from apps/api/package.json (read once, never bundled into the answer path). */
function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(resolve(here, "../../../package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
const VERSION = readVersion();

export async function adminSystemRoutes(app: FastifyInstance, opts: { ctx: AppContext }) {
  const { ctx } = opts;
  const admin = { preHandler: [app.requireAdmin] };

  app.get("/admin/system/health", admin, async (): Promise<SystemHealth> => {
    const vision = await createVisionClient(ctx).health();
    return {
      db: dbState(),
      vision: {
        ok: vision.ok,
        mock: vision.mock,
        modelVersion: vision.modelVersion ?? null,
        latencyMs: vision.latencyMs ?? null,
        url: vision.url ?? null,
      },
      version: VERSION,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      checkedAt: ctx.now().toISOString(),
    };
  });
}
