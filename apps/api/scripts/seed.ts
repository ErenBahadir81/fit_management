import { loadConfig } from "../src/config";
import { connectDb, disconnectDb } from "../src/db";
import { runSeed, seedOptionsFromConfig } from "../src/seed/index";

const config = loadConfig();
await connectDb(config.MONGO_URI);
const report = await runSeed(seedOptionsFromConfig(config));
await disconnectDb();
if (report.skippedUsers.length) console.warn(`seed accounts not created (no password): ${report.skippedUsers.join(", ")}`);
for (const w of report.warnings) console.warn(`WARNING: ${w}`);
console.log("seed done");
