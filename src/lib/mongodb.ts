import mongoose from "mongoose";

const FALLBACK_URI =
  "mongodb://root:HhAsS9OIu6miPEiBrVUUuI8v3dyqqdRyUHEX6KAgmC7ziL2USzHrcHRXxTxjq9Q7@159.89.14.127:27017/fitfloow?authSource=admin&directConnection=true";

const MONGO_URI = process.env.MONGO_URI || FALLBACK_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache =
  global._mongooseCache ?? (global._mongooseCache = { conn: null, promise: null });

export async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGO_URI, {
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 10,
      })
      .then((m) => m);
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  return cached.conn;
}
