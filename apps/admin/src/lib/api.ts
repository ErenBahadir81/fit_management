import { createApiClient, type ApiClient } from "@fitfloow/api-client";
import { createFakeApiClient } from "./fake/client";

/**
 * `NEXT_PUBLIC_API_FAKE` is inlined by Next at build time, so with the flag unset the
 * ternary folds to the real client and `./fake/client` (a side-effect-free module) is
 * dropped from the bundle. Set it to "1" to run the panel against in-memory data.
 */
export const USE_FAKE_API = process.env.NEXT_PUBLIC_API_FAKE === "1";

let client: ApiClient | null = null;

export function getApi(): ApiClient {
  if (client) return client;
  client = USE_FAKE_API
    ? createFakeApiClient({ latencyMs: 320, signedIn: true })
    : createApiClient({
        baseUrl: "/api/v1",
        authMode: "cookie",
        onUnauthorized: () => {
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
            // A hard navigation is intentional here: the session is gone, so every cached
            // query and client state must be dropped, and this runs outside React.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
          }
        },
      });
  return client;
}

/** Test seam — lets a test swap in its own fake without touching module internals. */
export function __setApiClient(next: ApiClient | null): void {
  client = next;
}

export const api = new Proxy({} as ApiClient, {
  get(_target, prop: string) {
    return getApi()[prop as keyof ApiClient];
  },
});
