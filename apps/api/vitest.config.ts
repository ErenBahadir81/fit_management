import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    env: { NODE_ENV: "test", JWT_SECRET: "test-secret-test-secret-test-secret", LOG_LEVEL: "silent" },
  },
});
