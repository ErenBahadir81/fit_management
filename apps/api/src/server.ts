import { loadConfig } from "./config";
import { connectDb } from "./db";
import { buildApp } from "./app";
import { RealHttpClient } from "./lib/http";

async function main() {
  const config = loadConfig();
  let uri = config.MONGO_URI;
  if (config.MONGO_MEMORY) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const mem = await MongoMemoryServer.create();
    uri = mem.getUri("fitfloow");
    console.log(`[api] in-memory MongoDB at ${uri}`);
  }
  await connectDb(uri);
  const app = await buildApp({ config, http: new RealHttpClient(), now: () => new Date() });
  if (config.SEED_ON_BOOT) {
    try {
      const seed = await import("./seed/index");
      await seed.runSeed();
    } catch (e) {
      app.log.warn({ err: e }, "seed skipped");
    }
  }
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`FitFloow API on http://${config.HOST}:${config.PORT}/api/v1`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
