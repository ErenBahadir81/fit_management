// Runs once, on the first start of an EMPTY mongo-data volume (docker-entrypoint-initdb.d), as the root user.
// Creates the least-privilege account the API connects with: readWrite on the app database only.
const dbName = process.env.MONGO_APP_DB || "fitfloow";
const user = process.env.MONGO_APP_USER;
const pwd = process.env.MONGO_APP_PASSWORD;
if (!user || !pwd) throw new Error("MONGO_APP_USER and MONGO_APP_PASSWORD must be set");

db.getSiblingDB(dbName).createUser({ user, pwd, roles: [{ role: "readWrite", db: dbName }] });
print(`[mongo-init] created ${user} (readWrite on ${dbName})`);
