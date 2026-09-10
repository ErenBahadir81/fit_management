import { createMMKV, type MMKV } from "react-native-mmkv";

/** Single synchronous key-value store (MMKV v4 / Nitro). Web falls back to localStorage inside the lib. */
export const storage: MMKV = createMMKV({ id: "fitfloow" });

export function getJSON<T>(key: string): T | null {
  const raw = storage.getString(key);
  if (raw === undefined || raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setJSON(key: string, value: unknown): void {
  storage.set(key, JSON.stringify(value));
}

export function removeKey(key: string): void {
  storage.remove(key);
}

/** Well-known keys (keep them here so features never collide). */
export const STORAGE_KEYS = {
  themeMode: "theme.mode",
  sessionUser: "session.user",
  queryCache: "query.cache.v1",
  webTokens: "auth.tokens.web",
  /** In-progress workout draft (cleared on finish, discard and sign-out). */
  workoutDraft: "training.workout.draft.v1",
} as const;
