import { createApiClient, type ApiClient, type FetchLike } from "@fitfloow/api-client";
import { createSecureTokenStore } from "./auth";
import { env } from "./env";

/** The app-wide token store (secure). Also used by the FakeApi in demo mode so logins persist. */
export const tokenStore = createSecureTokenStore();

type Handler = () => void | Promise<void>;
const unauthorizedHandlers = new Set<Handler>();

/** Subscribe to "session is gone" (401 that could not be refreshed). Returns an unsubscribe. */
export function onUnauthorized(handler: Handler): () => void {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}
export async function emitUnauthorized(): Promise<void> {
  for (const h of [...unauthorizedHandlers]) await h();
}

export function createClient(opts: { fetch?: FetchLike; baseUrl?: string } = {}): ApiClient {
  return createApiClient({
    baseUrl: opts.baseUrl ?? env.apiUrl,
    tokens: tokenStore,
    fetch: opts.fetch,
    timeoutMs: 15_000,
    onUnauthorized: emitUnauthorized,
  });
}

let client: ApiClient | null = null;

/** The client every feature uses. Lazily created; `EXPO_PUBLIC_API_FAKE=1` swaps in the in-memory FakeApi. */
export function getApi(): ApiClient {
  if (!client) {
    // `process.env.EXPO_PUBLIC_*` is inlined by Metro *per file*; testing it here (not via `env`) lets
    // the minifier drop this branch — and the whole in-memory FakeApi — from production bundles.
    if (process.env.EXPO_PUBLIC_API_FAKE === "1") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createFakeApi } = require("./fake") as typeof import("./fake");
      client = createFakeApi({ tokens: tokenStore });
    } else {
      client = createClient();
    }
  }
  return client;
}

/** Tests / previews: inject a client. */
export function setApi(next: ApiClient | null): void {
  client = next;
}
