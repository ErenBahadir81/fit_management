import * as SecureStore from "expo-secure-store";
import { createSecureTokenStore } from "../../src/lib/auth";
import { createApiClient } from "@fitfloow/api-client";
import { setApi, onUnauthorized, emitUnauthorized } from "../../src/lib/api";
import { createFakeApi, FAKE_CREDENTIALS } from "../../src/lib/fake";
import { useSession } from "../../src/features/auth/session";
import { getJSON, STORAGE_KEYS, storage } from "../../src/lib/storage";

describe("secure token store", () => {
  beforeEach(() => jest.clearAllMocks());

  test("setTokens persists both tokens to SecureStore and serves them from memory", async () => {
    const store = createSecureTokenStore();
    await store.setTokens({ accessToken: "a1", refreshToken: "r1" });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.stringContaining("access"), "a1", expect.anything());
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.stringContaining("refresh"), "r1", expect.anything());
    expect(await store.getAccessToken()).toBe("a1");
    expect(store.hasTokens()).toBe(true);
    await store.clear();
    expect(await store.getRefreshToken()).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  test("load() hydrates from SecureStore once", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (k: string) => (k.includes("access") ? "acc" : "ref"));
    const store = createSecureTokenStore();
    expect(store.hasTokens()).toBe(false);
    await store.load();
    expect(store.hasTokens()).toBe(true);
    expect(await store.getAccessToken()).toBe("acc");
  });
});

describe("session store", () => {
  beforeEach(async () => {
    storage.clearAll();
    useSession.setState({ status: "booting", user: null });
  });

  test("signIn stores the user (persisted) and signOut clears everything", async () => {
    const api = createFakeApi({ latencyMs: 0 });
    setApi(api);
    const res = await api.auth.login(FAKE_CREDENTIALS.username, FAKE_CREDENTIALS.password);
    useSession.getState().signIn(res.user);
    expect(useSession.getState().status).toBe("signedIn");
    expect(getJSON(STORAGE_KEYS.sessionUser)).toMatchObject({ username: "eren" });
    await useSession.getState().signOut();
    expect(useSession.getState().status).toBe("signedOut");
    expect(useSession.getState().user).toBeNull();
    expect(getJSON(STORAGE_KEYS.sessionUser)).toBeNull();
  });

  test("boot() with a cached user + tokens signs in instantly (cache-first) and refreshes /auth/me", async () => {
    const api = createFakeApi({ latencyMs: 0, signedIn: true });
    setApi(api);
    storage.set(STORAGE_KEYS.sessionUser, JSON.stringify({ ...(await api.auth.me()).user, displayName: "Eski İsim" }));
    const p = useSession.getState().boot();
    // instantly signed in from cache
    expect(useSession.getState().status).toBe("signedIn");
    expect(useSession.getState().user?.displayName).toBe("Eski İsim");
    await p;
    expect(useSession.getState().user?.displayName).not.toBe("Eski İsim");
  });

  test("boot() without tokens → signedOut", async () => {
    setApi(createFakeApi({ latencyMs: 0 }));
    await useSession.getState().boot();
    expect(useSession.getState().status).toBe("signedOut");
  });

  test("an unauthorized event forces sign-out", async () => {
    setApi(createFakeApi({ latencyMs: 0, signedIn: true }));
    useSession.setState({ status: "signedIn", user: (await createFakeApi({ latencyMs: 0, signedIn: true }).auth.me()).user });
    await emitUnauthorized();
    expect(useSession.getState().status).toBe("signedOut");
  });

  test("onUnauthorized handlers can be registered and unregistered", async () => {
    const h = jest.fn();
    const off = onUnauthorized(h);
    await emitUnauthorized();
    expect(h).toHaveBeenCalledTimes(1);
    off();
    await emitUnauthorized();
    expect(h).toHaveBeenCalledTimes(1);
  });

  test("the real client wires onUnauthorized: a 401 that cannot refresh signs the user out", async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ error: { code: "AUTH_INVALID", message: "x" } }), { status: 401 }));
    const client = createApiClient({ baseUrl: "http://x", fetch: fetchMock as never, onUnauthorized: emitUnauthorized });
    setApi(client);
    useSession.setState({ status: "signedIn", user: null });
    await expect(client.auth.me()).rejects.toMatchObject({ status: 401 });
    expect(useSession.getState().status).toBe("signedOut");
  });
});
