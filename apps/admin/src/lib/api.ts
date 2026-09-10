import { createApiClient, type ApiClient } from "@fitfloow/api-client";
import { createFakeApiClient } from "./fake/client";

/**
 * `process.env.NEXT_PUBLIC_API_FAKE` is inlined by Next at build time. Both branches below
 * test the inlined literal directly (not a captured variable) so the comparison folds to a
 * constant and the unused branch — plus the side-effect-free `./fake/client` module it
 * references — is dropped from the default (real-client) bundle.
 */
export const USE_FAKE_API = process.env.NEXT_PUBLIC_API_FAKE === "1";

let client: ApiClient | null = null;

function createRealClient(): ApiClient {
  return createApiClient({
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
}

export function getApi(): ApiClient {
  if (client) return client;
  client =
    process.env.NEXT_PUBLIC_API_FAKE === "1" ? createFakeApiClient({ latencyMs: 320, signedIn: true }) : createRealClient();
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
