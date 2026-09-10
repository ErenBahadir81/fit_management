/**
 * Public runtime config. Only EXPO_PUBLIC_* vars are inlined into the bundle.
 *  - EXPO_PUBLIC_API_URL   base URL of the API (default: local dev server)
 *  - EXPO_PUBLIC_API_FAKE  "1" → in-memory FakeApi (demo mode, no backend needed)
 */
export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1",
  fakeApi: process.env.EXPO_PUBLIC_API_FAKE === "1",
  appVersion: "2.0.0",
} as const;
