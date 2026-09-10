import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { serializerCompiler, validatorCompiler, jsonSchemaTransform } from "fastify-type-provider-zod";
import { authPlugin } from "./lib/auth";
import { errorHandler } from "./lib/errors";
import { dbState } from "./db";
import type { AppContext } from "./context";
import { registerPlatformModule } from "./modules/platform/index";
import { registerTrainingModule } from "./modules/training/index";
import { registerBodyModule } from "./modules/body/index";
import { registerNutritionModule } from "./modules/nutrition/index";
import { registerVisionModule } from "./modules/vision/index";

export const API_PREFIX = "/api/v1";
const startedAt = Date.now();

/**
 * Rate-limit bucket. The token is *verified* before it is trusted, so a client cannot mint a fresh
 * bucket by sending a garbage `Authorization` header (which would defeat the login limit) nor by
 * rotating its refresh token (which would defeat the scan limit). Anything unverifiable — no
 * header, a forged one, an expired one, cookie auth — falls back to the client IP.
 */
export function rateLimitKey(app: FastifyInstance, req: FastifyRequest): string {
  const header = req.headers.authorization;
  const token = typeof header === "string" && /^bearer /i.test(header) ? header.slice(7).trim() : "";
  if (token) {
    try {
      const payload = app.jwt.verify<{ sub?: string }>(token);
      if (payload?.sub) return `u:${payload.sub}`;
    } catch {
      /* forged or expired → IP bucket */
    }
  }
  return `ip:${req.ip}`;
}

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: ctx.config.isTest
      ? false
      : {
          level: ctx.config.LOG_LEVEL,
          ...(ctx.config.isProd ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
        },
    trustProxy: true,
    bodyLimit: 8 * 1024 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || ctx.config.corsOrigins.includes(origin) || ctx.config.corsOrigins.includes("*")) cb(null, true);
      else cb(null, false);
    },
    credentials: true,
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    allowList: ctx.config.isTest ? ["127.0.0.1"] : [],
    keyGenerator: (req) => rateLimitKey(app, req),
  });
  await app.register(multipart, { limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 5, parts: 10 } });
  await app.register(authPlugin, { config: ctx.config });

  if (!ctx.config.isProd && !ctx.config.isTest) {
    const swagger = await import("@fastify/swagger");
    const swaggerUi = await import("@fastify/swagger-ui");
    await app.register(swagger.default, {
      openapi: { info: { title: "FitFloow API", version: "2.0.0" } },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi.default, { routePrefix: "/docs" });
  }

  app.get("/health", async () => ({ ok: true, uptime: Math.round((Date.now() - startedAt) / 1000), db: dbState() }));

  await app.register(
    async (api) => {
      api.get("/health", async () => ({ ok: true, uptime: Math.round((Date.now() - startedAt) / 1000), db: dbState() }));
      await registerPlatformModule(api, ctx);
      await registerTrainingModule(api, ctx);
      await registerBodyModule(api, ctx);
      await registerNutritionModule(api, ctx);
      await registerVisionModule(api, ctx);
    },
    { prefix: API_PREFIX }
  );

  return app;
}
