import { createApiClient, memoryTokenStore, type ApiClient, type TokenStore } from "@fitfloow/api-client";
import { emitUnauthorized } from "../api";
import { createFakeFetch, createFakeState, FAKE_BASE_URL, FAKE_CREDENTIALS, type FakeFetchOptions, type FakeState } from "./fakeFetch";

export { createFakeFetch, createFakeState, FAKE_BASE_URL, FAKE_CREDENTIALS, type FakeState };
export * as fixtures from "./fixtures";

export interface FakeApiOptions extends FakeFetchOptions {
  /** Start with a valid session (tests / previews). */
  signedIn?: boolean;
  tokens?: TokenStore;
}

/**
 * A fully typed `ApiClient` backed by the in-memory fake. Enabled app-wide by `EXPO_PUBLIC_API_FAKE=1`
 * (login: eren / eren123). In tests: `setApi(createFakeApi({ latencyMs: 0, signedIn: true }))`.
 */
export function createFakeApi(opts: FakeApiOptions = {}): ApiClient & { fake: FakeState } {
  const fetch = createFakeFetch(opts);
  const tokens = opts.tokens ?? memoryTokenStore();
  if (opts.signedIn) {
    const access = `fake.access.${fetch.state.user.username}.seed`;
    const refresh = `fake.refresh.${fetch.state.user.username}.seed`;
    fetch.state.sessions.add(access);
    fetch.state.sessions.add(refresh);
    void tokens.setTokens({ accessToken: access, refreshToken: refresh });
  }
  const client = createApiClient({ baseUrl: FAKE_BASE_URL, tokens, fetch, onUnauthorized: emitUnauthorized });
  return Object.assign(client, { fake: fetch.state });
}
