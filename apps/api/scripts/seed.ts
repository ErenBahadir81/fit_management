import { loadConfig } from "../src/config";
import { connectDb, disconnectDb } from "../src/db";
import { runSeed } from "../src/seed/index";

const config = loadConfig();
await connectDb(config.MONGO_URI);
await runSeed();
await disconnectDb();
console.log("seed done");
