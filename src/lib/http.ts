import { NextResponse } from "next/server";
import { getUserId } from "./auth";

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

export function serverError(message = "server error") {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Oturum yoksa null + 401 response döner; varsa userId döner. */
export function requireUser(): { userId: string } | { response: NextResponse } {
  const userId = getUserId();
  if (!userId) return { response: unauthorized() };
  return { userId };
}
