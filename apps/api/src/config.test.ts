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
  it("splits CORS origins", () => {
    expect(loadConfig({ NODE_ENV: "test", CORS_ORIGINS: "http://a, http://b" }).corsOrigins).toEqual(["http://a", "http://b"]);
  });
  it("requires a JWT secret outside tests", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow();
  });
});
