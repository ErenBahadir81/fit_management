import "server-only";
import { headers } from "next/headers";
import type { UserDTO } from "@fitfloow/core";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";

/** The demo identity used while running against the in-memory fake. */
export const DEMO_ADMIN: UserDTO = {
  id: "usr_eren",
  username: "eren",
  displayName: "Eren Yılmaz",
  role: "admin",
  gender: "male",
  heightCm: 183,
  birthDate: "1996-04-18",
  activityLevel: "moderate",
  measurementDay: 0,
  mascotEnabled: true,
  createdAt: "2025-11-02T07:12:00.000Z",
  lastSeenAt: null,
};

/**
 * Server-side auth gate for `(panel)`: forwards the browser's cookies to the API's
 * `/auth/me`. Returns `null` on 401/403 or when the API is unreachable, so the layout can
 * redirect to /login instead of rendering a broken shell.
 */
export async function getSessionUser(): Promise<UserDTO | null> {
  if (process.env.NEXT_PUBLIC_API_FAKE === "1") return DEMO_ADMIN;

  const cookie = (await headers()).get("cookie") ?? "";
  if (!cookie) return null;

  try {
    const res = await fetch(`${API_URL}/api/v1/auth/me`, {
      headers: { cookie, accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: UserDTO };
    return data.user ?? null;
  } catch {
    return null;
  }
}
