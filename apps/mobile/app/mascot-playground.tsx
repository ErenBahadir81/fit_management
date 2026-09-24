import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { loadSkiaWeb } from "../src/lib/skiaWeb";

function Loading({ error }: { error?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
      {error ? <Text>{error}</Text> : <ActivityIndicator />}
      <Text>Skia yükleniyor…</Text>
    </View>
  );
}

/**
 * The mascot bench. Nothing can be drawn until Skia exists, and on web that means CanvasKit's
 * wasm — which this app does not preload.
 *
 * `loadSkiaWeb` (src/lib/skiaWeb.tsx) owns the load and the singleton re-seed it needs; the root
 * layout already awaits the same promise, so on web this usually resolves instantly.
 */
export default function MascotPlaygroundRoute() {
  if (Platform.OS !== "web") {
    // Native has Skia in the runtime already; `require` keeps the web bundle from evaluating it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Native = require("../src/mascot/model/Playground").default as React.ComponentType;
    return <Native />;
  }
  return <WebPlayground />;
}

function WebPlayground() {
  const [Screen, setScreen] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadSkiaWeb();
        const mod = await import("../src/mascot/model/Playground");
        if (alive) setScreen(() => mod.default);
      } catch (e) {
        if (alive) setError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!Screen) return <Loading error={error} />;
  return <Screen />;
}
