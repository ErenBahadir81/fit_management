import React, { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { QueryClient, QueryClientProvider, dehydrate, focusManager, hydrate } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import type { MMKV } from "react-native-mmkv";
import { env } from "./env";
import { STORAGE_KEYS, storage } from "./storage";

export const QUERY_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: QUERY_CACHE_MAX_AGE,
        networkMode: "offlineFirst",
        retry: 1,
        retryDelay: (n) => Math.min(1000 * 2 ** n, 4000),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: { networkMode: "offlineFirst", retry: 0 },
    },
  });
}

/** A `Persister` whose methods are synchronous (MMKV). Structurally compatible with TanStack's `Persister`. */
export interface SyncPersister extends Persister {
  persistClient(client: PersistedClient): void;
  restoreClient(): PersistedClient | undefined;
  removeClient(): void;
}

/** Synchronous persister over MMKV. Writes are throttled (default 1 s) since the cache changes often. */
export function createMMKVPersister(store: MMKV, key: string, throttleMs = 1000): SyncPersister {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PersistedClient | null = null;
  const write = (c: PersistedClient) => {
    try {
      store.set(key, JSON.stringify(c));
    } catch {
      /* quota / serialization issues must never crash the app */
    }
  };
  return {
    persistClient(c) {
      if (throttleMs <= 0) return write(c);
      pending = c;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (pending) write(pending);
        pending = null;
      }, throttleMs);
    },
    restoreClient() {
      const raw = store.getString(key);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw) as PersistedClient;
      } catch {
        return undefined;
      }
    },
    removeClient() {
      pending = null;
      store.remove(key);
    },
  };
}

/** Hydrate `qc` from the persisted cache synchronously — before the first render, so cached screens paint instantly. */
export function restoreQueryCacheSync(qc: QueryClient, persister: SyncPersister, opts: { buster: string; maxAge: number }): boolean {
  const persisted = persister.restoreClient();
  if (!persisted) return false;
  if (persisted.buster !== opts.buster || Date.now() - persisted.timestamp > opts.maxAge) {
    persister.removeClient();
    return false;
  }
  try {
    hydrate(qc, persisted.clientState);
    return true;
  } catch {
    persister.removeClient();
    return false;
  }
}

export const persister = createMMKVPersister(storage, STORAGE_KEYS.queryCache);
export const queryClient = createQueryClient();
restoreQueryCacheSync(queryClient, persister, { buster: env.appVersion, maxAge: QUERY_CACHE_MAX_AGE });

export interface AppQueryProviderProps {
  children: React.ReactNode;
  client?: QueryClient;
  persister?: SyncPersister;
  buster?: string;
}

/** QueryClientProvider + persistence subscription + app-focus wiring. */
export function AppQueryProvider({ children, client = queryClient, persister: p = persister, buster = env.appVersion }: AppQueryProviderProps) {
  const [qc] = useState(client);
  useEffect(() => {
    const save = () => {
      p.persistClient({
        buster,
        timestamp: Date.now(),
        clientState: dehydrate(qc, { shouldDehydrateQuery: (q) => q.state.status === "success" }),
      });
    };
    const unsubQ = qc.getQueryCache().subscribe(save);
    const unsubM = qc.getMutationCache().subscribe(save);
    return () => {
      unsubQ();
      unsubM();
    };
  }, [qc, p, buster]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => focusManager.setFocused(s === "active"));
    return () => sub.remove();
  }, []);

  return React.createElement(QueryClientProvider, { client: qc }, children);
}

/** Drop everything (logout). */
export function clearQueryCache(qc: QueryClient = queryClient): void {
  qc.clear();
  persister.removeClient();
}
