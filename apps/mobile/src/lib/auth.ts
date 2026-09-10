import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { TokenStore } from "@fitfloow/api-client";
import { STORAGE_KEYS, getJSON, removeKey, setJSON } from "./storage";

const KEY_ACCESS = "fitfloow.access";
const KEY_REFRESH = "fitfloow.refresh";
const SECURE_OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export interface SecureTokenStore extends TokenStore {
  /** Hydrate the in-memory cache from secure storage (call once at boot). */
  load(): Promise<boolean>;
  hasTokens(): boolean;
}

type Pair = { accessToken: string; refreshToken: string } | null;

/**
 * Tokens live in expo-secure-store (Keychain / Keystore) with an in-memory mirror so the transport
 * can attach the access token synchronously. Web (smoke target only) falls back to MMKV/localStorage.
 */
export function createSecureTokenStore(): SecureTokenStore {
  let cache: Pair = null;
  let loaded = false;
  const web = Platform.OS === "web";

  async function persist(p: Pair) {
    if (web) {
      if (p) setJSON(STORAGE_KEYS.webTokens, p);
      else removeKey(STORAGE_KEYS.webTokens);
      return;
    }
    try {
      if (p) {
        await SecureStore.setItemAsync(KEY_ACCESS, p.accessToken, SECURE_OPTS);
        await SecureStore.setItemAsync(KEY_REFRESH, p.refreshToken, SECURE_OPTS);
      } else {
        await SecureStore.deleteItemAsync(KEY_ACCESS);
        await SecureStore.deleteItemAsync(KEY_REFRESH);
      }
    } catch {
      /* keychain unavailable (simulator without passcode etc.) — memory cache still works this session */
    }
  }

  return {
    async load() {
      if (loaded) return cache !== null;
      loaded = true;
      try {
        if (web) {
          cache = getJSON<{ accessToken: string; refreshToken: string }>(STORAGE_KEYS.webTokens);
        } else {
          const [a, r] = await Promise.all([SecureStore.getItemAsync(KEY_ACCESS), SecureStore.getItemAsync(KEY_REFRESH)]);
          cache = a && r ? { accessToken: a, refreshToken: r } : null;
        }
      } catch {
        cache = null;
      }
      return cache !== null;
    },
    hasTokens: () => cache !== null,
    getAccessToken: () => cache?.accessToken ?? null,
    getRefreshToken: () => cache?.refreshToken ?? null,
    async setTokens(t) {
      cache = { accessToken: t.accessToken, refreshToken: t.refreshToken };
      loaded = true;
      await persist(cache);
    },
    async clear() {
      cache = null;
      await persist(null);
    },
  };
}
