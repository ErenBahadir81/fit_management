import mongoose from "mongoose";

let connecting: Promise<typeof mongoose> | null = null;

export async function connectDb(uri: string): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!connecting) {
    mongoose.set("strictQuery", true);
    connecting = mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 20 }).finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

export function dbState(): "ok" | "down" {
  return mongoose.connection.readyState === 1 ? "ok" : "down";
}
