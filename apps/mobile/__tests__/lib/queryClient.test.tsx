import React from "react";
import { QueryClient, dehydrate, useQuery } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { createQueryClient, createMMKVPersister, restoreQueryCacheSync, AppQueryProvider, QUERY_CACHE_MAX_AGE } from "../../src/lib/queryClient";
import { storage } from "../../src/lib/storage";

describe("query client", () => {
  beforeEach(() => storage.clearAll());

  test("defaults: 30 s stale, 7 d gc, offline-first", () => {
    const qc = createQueryClient();
    const d = qc.getDefaultOptions().queries!;
    expect(d.staleTime).toBe(30_000);
    expect(d.gcTime).toBe(7 * 24 * 60 * 60 * 1000);
    expect(d.networkMode).toBe("offlineFirst");
    expect(QUERY_CACHE_MAX_AGE).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("MMKV persister round-trips and removes", () => {
    const p = createMMKVPersister(storage, "t.cache", 0);
    const seed = new QueryClient();
    seed.setQueryData(["home"], { hello: "world" });
    p.persistClient({ timestamp: 123, buster: "b", clientState: dehydrate(seed) });
    const restored = p.restoreClient();
    expect(restored?.buster).toBe("b");
    expect(restored?.clientState.queries[0].state.data).toEqual({ hello: "world" });
    p.removeClient();
    expect(p.restoreClient()).toBeUndefined();
  });

  test("restoreQueryCacheSync hydrates matching buster and drops stale/mismatched caches", () => {
    const p = createMMKVPersister(storage, "t.cache", 0);
    const seed = new QueryClient();
    seed.setQueryData(["home"], { n: 1 });
    p.persistClient({ timestamp: Date.now(), buster: "v1", clientState: dehydrate(seed) });
    const qc = createQueryClient();
    expect(restoreQueryCacheSync(qc, p, { buster: "v1", maxAge: 1000 })).toBe(true);
    expect(qc.getQueryData(["home"])).toEqual({ n: 1 });

    const qc2 = createQueryClient();
    expect(restoreQueryCacheSync(qc2, p, { buster: "v2", maxAge: 1000 })).toBe(false);
    expect(p.restoreClient()).toBeUndefined();
  });

  test("AppQueryProvider renders persisted data on the very first render (no skeleton)", async () => {
    const p = createMMKVPersister(storage, "t.cache", 0);
    const seed = new QueryClient();
    seed.setQueryData(["home"], { cached: true });
    p.persistClient({ timestamp: Date.now(), buster: "v1", clientState: dehydrate(seed) });
    const qc = createQueryClient();
    restoreQueryCacheSync(qc, p, { buster: "v1", maxAge: QUERY_CACHE_MAX_AGE });
    const never = () => new Promise<never>(() => {});
    const { result } = await renderHook(() => useQuery({ queryKey: ["home"], queryFn: never }), {
      wrapper: ({ children }) => (
        <AppQueryProvider client={qc} persister={p} buster="v1">
          {children}
        </AppQueryProvider>
      ),
    });
    expect(result.current.data).toEqual({ cached: true });
    expect(result.current.isLoading).toBe(false);
  });

  test("AppQueryProvider persists successful queries back to storage", async () => {
    const p = createMMKVPersister(storage, "t.cache2", 0);
    const qc = createQueryClient();
    const { result } = await renderHook(() => useQuery({ queryKey: ["x"], queryFn: async () => ({ ok: 1 }) }), {
      wrapper: ({ children }) => (
        <AppQueryProvider client={qc} persister={p} buster="v1">
          {children}
        </AppQueryProvider>
      ),
    });
    await waitFor(() => expect(result.current.data).toEqual({ ok: 1 }));
    await waitFor(() => expect(p.restoreClient()?.clientState.queries.some((q) => q.queryKey[0] === "x")).toBe(true));
  });
});
