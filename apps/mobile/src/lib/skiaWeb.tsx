import React, { useEffect, useState } from "react";
import { Platform } from "react-native";

const CANVASKIT_CDN = "https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/";

/**
 * Skia on web needs CanvasKit's wasm, and this app does not preload it. Worse, the web entry of
 * `@shopify/react-native-skia` binds its API *at module evaluation time*
 * (`Skia = JsiSkApi(global.CanvasKit)`), and the bundle pulls that module in through the chart
 * screens long before anything renders — so the singleton has already captured `undefined`.
 *
 * `loadSkiaWeb` therefore loads the wasm and then re-seeds the existing `Skia` object *in place*,
 * which fixes both the already-captured references and every canvas mounted afterwards. Same trick
 * as `app/mascot-playground.tsx`, hoisted so the whole app can use Skia (the mascot) on web.
 *
 * Native already has Skia in the runtime, so `useSkiaWeb` reports ready on the first frame there.
 */
let pending: Promise<void> | null = null;
let unavailable = false;

/** True only after a web load attempt failed — callers should fall back to a non-Skia rendering. */
export function isSkiaUnavailable(): boolean {
  return unavailable;
}

export function loadSkiaWeb(): Promise<void> {
  if (Platform.OS !== "web") return Promise.resolve();
  pending ??= (async () => {
    const { LoadSkiaWeb } = await import("@shopify/react-native-skia/lib/module/web");
    await LoadSkiaWeb({ locateFile: (file: string) => `${CANVASKIT_CDN}${file}` });
    const g = globalThis as unknown as { CanvasKit?: unknown };
    const { JsiSkApi } = await import("@shopify/react-native-skia/lib/module/skia/web");
    const RNSkia = await import("@shopify/react-native-skia");
    Object.assign(RNSkia.Skia as object, JsiSkApi(g.CanvasKit as never));
  })();
  return pending;
}

/** `true` once Skia may be rendered. Always `true` on native. */
export function useSkiaReady(): boolean {
  const [ready, setReady] = useState(Platform.OS !== "web");
  useEffect(() => {
    if (ready) return;
    let alive = true;
    loadSkiaWeb()
      // A failed wasm fetch must not wedge the whole app behind a blank screen: flip ready anyway
      // and let the mascot be the only thing that misses out.
      .catch((e) => {
        unavailable = true;
        console.warn("[skia] CanvasKit failed to load", e);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [ready]);
  return ready;
}
