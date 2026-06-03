import { cookies } from "next/headers";

export const SESSION_COOKIE = "fit_uid";

export function getUserId(): string | null {
  return cookies().get(SESSION_COOKIE)?.value || null;
}

export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 gün
