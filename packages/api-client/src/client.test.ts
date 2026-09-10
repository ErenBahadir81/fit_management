import { describe, expect, it, vi } from "vitest";
import { ApiClientError, buildQuery, createApiClient, memoryTokenStore } from "./index";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("api-client", () => {
  it("buildQuery skips empty values", () => {
    expect(buildQuery({ a: 1, b: undefined, c: "", d: "x", e: false })).toBe("?a=1&d=x&e=false");
    expect(buildQuery()).toBe("");
  });

  it("attaches bearer token and parses JSON", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("http://api/api/v1/auth/me");
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer acc");
      return jsonResponse(200, { user: { id: "u1" } });
    });
    const api = createApiClient({
      baseUrl: "http://api/api/v1",
      fetch: fetchMock as never,
      tokens: memoryTokenStore({ accessToken: "acc", refreshToken: "ref" }),
    });
    const res = await api.auth.me();
    expect(res.user.id).toBe("u1");
  });

  it("login stores tokens", async () => {
    const tokens = memoryTokenStore();
    const fetchMock = vi.fn(async () => jsonResponse(200, { accessToken: "a", refreshToken: "r", user: { id: "u" } }));
    const api = createApiClient({ baseUrl: "http://api", fetch: fetchMock as never, tokens });
    await api.auth.login("eren", "x");
    expect(await tokens.getAccessToken()).toBe("a");
    expect(await tokens.getRefreshToken()).toBe("r");
  });

  it("refreshes once on 401 and retries the original request", async () => {
    const tokens = memoryTokenStore({ accessToken: "old", refreshToken: "ref" });
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/auth/refresh")) return jsonResponse(200, { accessToken: "new", refreshToken: "ref2" });
      const auth = (init?.headers as Record<string, string>).authorization;
      if (auth === "Bearer old") return jsonResponse(401, { error: { code: "TOKEN_EXPIRED", message: "x" } });
      return jsonResponse(200, { program: { id: "p" } });
    });
    const api = createApiClient({ baseUrl: "http://api", fetch: fetchMock as never, tokens });
    const res = await api.training.program();
    expect(res.program.id).toBe("p");
    expect(calls).toEqual(["GET http://api/program", "POST http://api/auth/refresh", "GET http://api/program"]);
    expect(await tokens.getAccessToken()).toBe("new");
  });

  it("clears tokens and calls onUnauthorized when refresh fails", async () => {
    const tokens = memoryTokenStore({ accessToken: "old", refreshToken: "ref" });
    const onUnauthorized = vi.fn();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/auth/refresh")) return jsonResponse(401, { error: { code: "AUTH_INVALID", message: "x" } });
      return jsonResponse(401, { error: { code: "TOKEN_EXPIRED", message: "expired" } });
    });
    const api = createApiClient({ baseUrl: "http://api", fetch: fetchMock as never, tokens, onUnauthorized });
    await expect(api.training.program()).rejects.toMatchObject({ status: 401, code: "TOKEN_EXPIRED" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(await tokens.getAccessToken()).toBeNull();
  });

  it("maps error envelope to ApiClientError", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, { error: { code: "VALIDATION", message: "bad", details: [1] } }));
    const api = createApiClient({ baseUrl: "http://api", fetch: fetchMock as never });
    const err = await api.goals.create({ targetBodyFatPct: 7, profile: "optimal" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe("VALIDATION");
    expect(err.details).toEqual([1]);
  });

  it("network failure becomes status 0", async () => {
    const api = createApiClient({ baseUrl: "http://api", fetch: (async () => { throw new Error("boom"); }) as never });
    const err = await api.reports.home().catch((e) => e);
    expect(err.status).toBe(0);
    expect(err.isNetwork).toBe(true);
  });

  it("cookie mode never attaches bearer and uses credentials include", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBeUndefined();
      expect(init?.credentials).toBe("include");
      return jsonResponse(200, { users: [] });
    });
    const api = createApiClient({ baseUrl: "http://api", fetch: fetchMock as never, authMode: "cookie" });
    expect((await api.admin.users()).users).toEqual([]);
  });

  it("204 resolves to undefined", async () => {
    const api = createApiClient({ baseUrl: "http://api", fetch: (async () => new Response(null, { status: 204 })) as never });
    await expect(api.training.deleteWorkout("x")).resolves.toBeUndefined();
  });
});
