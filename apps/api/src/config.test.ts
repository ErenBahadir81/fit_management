import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("config", () => {
  it("parses boolean flags from env strings", () => {
    expect(loadConfig({ NODE_ENV: "test", VISION_MOCK: "0" }).VISION_MOCK).toBe(false);
    expect(loadConfig({ NODE_ENV: "test", VISION_MOCK: "1" }).VISION_MOCK).toBe(true);
    expect(loadConfig({ NODE_ENV: "test", VISION_MOCK: "false" }).VISION_MOCK).toBe(false);
    expect(loadConfig({ NODE_ENV: "test" }).VISION_MOCK).toBe(false);
    expect(loadConfig({ NODE_ENV: "test" }).SEED_ON_BOOT).toBe(true);
  });
  it("turns SEED_ON_BOOT off by default in production, but an explicit value wins", () => {
    const prod = { NODE_ENV: "production", JWT_SECRET: "prod-secret-prod-secret" } as const;
    expect(loadConfig(prod).SEED_ON_BOOT).toBe(false);
    expect(loadConfig({ ...prod, SEED_ON_BOOT: "1" }).SEED_ON_BOOT).toBe(true);
    expect(loadConfig({ NODE_ENV: "development", JWT_SECRET: "dev-secret-dev-secret" }).SEED_ON_BOOT).toBe(true);
  });
  it("treats empty seed passwords as unset and rejects short ones in production", () => {
    const prod = { NODE_ENV: "production", JWT_SECRET: "prod-secret-prod-secret" } as const;
    expect(loadConfig({ ...prod, SEED_ADMIN_PASSWORD: "" }).SEED_ADMIN_PASSWORD).toBeUndefined();
    expect(() => loadConfig({ ...prod, SEED_ADMIN_PASSWORD: "Asd*123" })).toThrow(/SEED_ADMIN_PASSWORD/);
    expect(() => loadConfig({ ...prod, SEED_USER_PASSWORD: "short" })).toThrow(/SEED_USER_PASSWORD/);
    expect(loadConfig({ ...prod, SEED_ADMIN_PASSWORD: "a-long-enough-secret" }).SEED_ADMIN_PASSWORD).toBe("a-long-enough-secret");
    expect(loadConfig({ NODE_ENV: "test", SEED_ADMIN_PASSWORD: "short" }).SEED_ADMIN_PASSWORD).toBe("short");
  });
  it("splits CORS origins", () => {
    expect(loadConfig({ NODE_ENV: "test", CORS_ORIGINS: "http://a, http://b" }).corsOrigins).toEqual(["http://a", "http://b"]);
  });
  it("requires a JWT secret outside tests", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow();
  });
});
