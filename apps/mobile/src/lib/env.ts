/**
 * Public runtime config. Only EXPO_PUBLIC_* vars are inlined into the bundle.
 *  - EXPO_PUBLIC_API_URL   base URL of the API (default: local dev server)
 *  - EXPO_PUBLIC_API_FAKE  "1" → in-memory FakeApi (demo mode, no backend needed)
 */
/**
 * Kept as a top-level constant (not an object field) so Metro can inline `process.env` and strip
 * the FakeApi from production bundles.
 */
export const FAKE_API = process.env.EXPO_PUBLIC_API_FAKE === "1";

export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1",
  fakeApi: FAKE_API,
  appVersion: "2.0.0",
} as const;
