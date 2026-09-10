import { MongoMemoryServer } from "mongodb-memory-server";

/** One mongod for the whole vitest run; each test file uses its own database name. */
export default async function globalSetup() {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: "fitfloow-test" } });
  process.env.MONGO_TEST_URI = mongod.getUri();
  return async () => {
    await mongod.stop();
  };
}
