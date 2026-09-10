import type { Types } from "mongoose";

export function oid(v: Types.ObjectId | string | { toString(): string } | null | undefined): string | null {
  if (v == null) return null;
  return String(v);
}

export function iso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

/** Strip mongoose internals and rename _id → id. Shallow. */
export function baseDoc<T extends { _id: unknown; createdAt?: Date; updatedAt?: Date }>(doc: T) {
  const maybe = doc as unknown as { toObject?: () => T };
  const o = (typeof maybe.toObject === "function" ? maybe.toObject() : doc) as T & { __v?: number };
  const { _id, __v, ...rest } = o;
  void __v;
  return { id: String(_id), ...rest, createdAt: iso(o.createdAt) ?? undefined, updatedAt: iso(o.updatedAt) ?? undefined };
}
