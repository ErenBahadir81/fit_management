import { z } from "zod";

/** "1" | "true" | "yes" | "on" → true; "0" | "false" | "" | "no" | "off" → false. */
const zBool = z
  .union([z.boolean(), z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
  });

const zEnv = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default("0.0.0.0"),
  MONGO_URI: z.string().default("mongodb://127.0.0.1:27017/fitfloow"),
  MONGO_MEMORY: zBool.default(false),
  JWT_SECRET: z.string().min(16),
  ACCESS_TTL_MIN: z.coerce.number().int().min(1).default(15),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:8081"),
  VISION_URL: z.string().default("http://127.0.0.1:8100"),
  VISION_MOCK: zBool.default(false),
  UPLOAD_DIR: z.string().default("./uploads"),
  LOG_LEVEL: z.string().default("info"),
  SEED_ON_BOOT: zBool.default(true),
  COOKIE_SECURE: zBool.default(false),
});

export type AppConfig = z.infer<typeof zEnv> & { corsOrigins: string[]; isTest: boolean; isProd: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = zEnv.parse({ ...env, JWT_SECRET: env.JWT_SECRET ?? (env.NODE_ENV === "test" ? "test-secret-test-secret" : undefined) });
  return {
    ...parsed,
    corsOrigins: parsed.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    isTest: parsed.NODE_ENV === "test",
    isProd: parsed.NODE_ENV === "production",
  };
}
