import type { ErrorCode } from "@fitfloow/core";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ErrorCode | string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
  get isAuth(): boolean {
    return this.status === 401;
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface TokenStore {
  getAccessToken(): Promise<string | null> | string | null;
  getRefreshToken(): Promise<string | null> | string | null;
  setTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void> | void;
  clear(): Promise<void> | void;
}

/** In-memory token store (tests, admin dev). */
export function memoryTokenStore(initial?: { accessToken: string; refreshToken: string }): TokenStore {
  let access = initial?.accessToken ?? null;
  let refresh = initial?.refreshToken ?? null;
  return {
    getAccessToken: () => access,
    getRefreshToken: () => refresh,
    setTokens: (t) => {
      access = t.accessToken;
      refresh = t.refreshToken;
    },
    clear: () => {
      access = null;
      refresh = null;
    },
  };
}

export interface ApiClientOptions {
  baseUrl: string; // e.g. "http://localhost:4000/api/v1"
  tokens?: TokenStore;
  /** "cookie" → send credentials:include and never attach Bearer (admin web); "bearer" (default, mobile). */
  authMode?: "bearer" | "cookie";
  fetch?: FetchLike;
  onUnauthorized?: () => void | Promise<void>;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  formData?: FormData;
  auth?: boolean; // default true
  signal?: AbortSignal;
}

export function buildQuery(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export interface Transport {
  request<T>(path: string, opts?: RequestOptions): Promise<T>;
}

export function createTransport(options: ApiClientOptions): Transport {
  const fetchImpl: FetchLike = options.fetch ?? ((i, init) => fetch(i, init));
  const mode = options.authMode ?? "bearer";
  const tokens = options.tokens ?? memoryTokenStore();
  let refreshing: Promise<boolean> | null = null;

  async function doRefresh(): Promise<boolean> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const refreshToken = mode === "bearer" ? await tokens.getRefreshToken() : null;
        if (mode === "bearer" && !refreshToken) return false;
        const res = await fetchImpl(`${options.baseUrl}/auth/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(options.headers ?? {}) },
          body: JSON.stringify(refreshToken ? { refreshToken } : {}),
          credentials: mode === "cookie" ? "include" : "same-origin",
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken: string; refreshToken: string };
        if (mode === "bearer") await tokens.setTokens(data);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function raw(path: string, opts: RequestOptions, retry: boolean): Promise<Response> {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (opts.body !== undefined && !opts.formData) headers["content-type"] = "application/json";
    if (mode === "bearer" && opts.auth !== false) {
      const token = await tokens.getAccessToken();
      if (token) headers.authorization = `Bearer ${token}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onAbort);
    try {
      const res = await fetchImpl(`${options.baseUrl}${path}${buildQuery(opts.query)}`, {
        method: opts.method ?? (opts.body !== undefined || opts.formData ? "POST" : "GET"),
        headers,
        body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
        credentials: mode === "cookie" ? "include" : "same-origin",
        signal: controller.signal,
      });
      if (res.status === 401 && retry && opts.auth !== false) {
        const ok = await doRefresh();
        if (ok) return raw(path, opts, false);
        await tokens.clear();
        await options.onUnauthorized?.();
      }
      return res;
    } catch (e) {
      throw new ApiClientError(0, "NETWORK", (e as Error)?.message || "Bağlantı hatası");
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
      const res = await raw(path, opts, true);
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      let json: unknown = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }
      if (!res.ok) {
        const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
        throw new ApiClientError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `HTTP ${res.status}`, err?.details);
      }
      return json as T;
    },
  };
}
