import { create } from "zustand";
import type { UserDTO } from "@fitfloow/core";
import { ApiClientError } from "@fitfloow/api-client";
import { getApi, onUnauthorized, tokenStore } from "../../lib/api";
import { clearQueryCache } from "../../lib/queryClient";
import { STORAGE_KEYS, getJSON, removeKey, setJSON } from "../../lib/storage";

export type SessionStatus = "booting" | "signedOut" | "signedIn";

export interface SessionState {
  status: SessionStatus;
  user: UserDTO | null;
  /** After a successful login. */
  signIn: (user: UserDTO) => void;
  /** Update the cached user (e.g. after PATCH /me). */
  setUser: (user: UserDTO) => void;
  /** Revoke on the server (best effort), clear tokens + caches. */
  signOut: () => Promise<void>;
  /** Local-only sign-out (401 that could not be refreshed). */
  forceSignOut: () => void;
  /** App start: cached user + tokens → signed in instantly, then `/auth/me` in the background. */
  boot: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  status: "booting",
  user: null,

  signIn: (user) => {
    setJSON(STORAGE_KEYS.sessionUser, user);
    set({ status: "signedIn", user });
  },

  setUser: (user) => {
    setJSON(STORAGE_KEYS.sessionUser, user);
    set({ user });
  },

  signOut: async () => {
    try {
      await getApi().auth.logout();
    } catch {
      /* offline logout is fine */
    }
    get().forceSignOut();
  },

  forceSignOut: () => {
    void tokenStore.clear();
    removeKey(STORAGE_KEYS.sessionUser);
    clearQueryCache();
    set({ status: "signedOut", user: null });
  },

  boot: async () => {
    // Cache-first: a cached user means a login happened (tokens are written together with it), so the
    // tabs render instantly; the secure-store read and /auth/me refresh happen in the background.
    const cached = getJSON<UserDTO>(STORAGE_KEYS.sessionUser);
    if (cached) set({ status: "signedIn", user: cached });
    await tokenStore.load();
    if (!tokenStore.hasTokens()) {
      get().forceSignOut();
      return;
    }
    try {
      const { user } = await getApi().auth.me();
      get().setUser(user);
      if (get().status !== "signedIn") set({ status: "signedIn" });
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        get().forceSignOut();
      } else if (!cached) {
        // no cached identity and the server is unreachable → back to login
        get().forceSignOut();
      }
      // otherwise: stay signed in with the cached user (offline-first)
    }
  },
}));

onUnauthorized(() => {
  if (useSession.getState().status !== "signedOut") useSession.getState().forceSignOut();
});
