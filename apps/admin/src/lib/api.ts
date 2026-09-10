import { createApiClient, type ApiClient } from "@fitfloow/api-client";

/**
 * `process.env.NEXT_PUBLIC_API_FAKE` is inlined by Next at build time, so the branch below
 * folds to a constant. The in-memory fake is reached only through a dynamic `import()`
 * inside the dead branch, which keeps its seed data in a separate chunk that the default
 * (real-client) build never references — a plain static import was not being shaken out.
 */
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

type Leaf = (...args: unknown[]) => Promise<unknown>;

/**
 * Every `ApiClient` method returns a promise, so a namespace proxy can defer loading the
 * fake until the first call: `api.admin.users()` resolves the module, walks to the method
 * and forwards the arguments.
 */
function createLazyFakeClient(): ApiClient {
  let loading: Promise<ApiClient> | null = null;
  const load = () => {
    loading ??= import("./fake/client").then((m) => m.createFakeApiClient({ latencyMs: 320, signedIn: true }));
    return loading;
  };

  const node = (path: string[]): unknown =>
    new Proxy(function noop() {} as object, {
      get: (_target, prop) => (typeof prop === "string" ? node([...path, prop]) : undefined),
      apply: async (_target, _thisArg, args: unknown[]) => {
        const fake = await load();
        let cursor: unknown = fake;
        for (const key of path) cursor = (cursor as Record<string, unknown>)[key];
        return (cursor as Leaf)(...args);
      },
    });

  return node([]) as ApiClient;
}

export function getApi(): ApiClient {
  if (client) return client;
  client = process.env.NEXT_PUBLIC_API_FAKE === "1" ? createLazyFakeClient() : createRealClient();
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
