import { NextResponse } from "next/server";
import { getUserId } from "./auth";
import { dbConnect } from "./mongodb";
import { User } from "./models";
import { ensureSeeded } from "./seed";

export function json(data: unknown, init?: number | ResponseInit) {
  const responseInit = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(data, responseInit);
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function badRequest(message = "bad request") {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function forbidden(message = "forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function serverError(message = "server error") {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Oturum yoksa null + 401 response döner; varsa userId döner. */
export function requireUser(): { userId: string } | { response: NextResponse } {
  const userId = getUserId();
  if (!userId) return { response: unauthorized() };
  return { userId };
}

/** Oturum yoksa 401, admin değilse 403 döner; aksi halde userId + kullanıcı belgesi döner. */
export async function requireAdmin(): Promise<
  { userId: string; user: any } | { response: NextResponse }
> {
  const userId = getUserId();
  if (!userId) return { response: unauthorized() };
  await ensureSeeded();
  await dbConnect();
  const user = await User.findById(userId);
  if (!user || user.role !== "admin") return { response: forbidden() };
  return { userId, user };
}
