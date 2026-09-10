/**
 * Minimal injectable HTTP client for upstream services (Open Food Facts, USDA, vision).
 * Real implementation uses global fetch with a timeout; tests inject FakeHttpClient.
 */
export interface HttpResponse {
  status: number;
  ok: boolean;
  json<T = unknown>(): Promise<T>;
  text(): Promise<string>;
}

export interface HttpRequest {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string | FormData | Uint8Array;
  timeoutMs?: number;
}

export interface HttpClient {
  request(url: string, req?: HttpRequest): Promise<HttpResponse>;
}

export class RealHttpClient implements HttpClient {
  async request(url: string, req: HttpRequest = {}): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 8000);
    try {
      const res = await fetch(url, {
        method: req.method ?? "GET",
        headers: req.headers,
        body: req.body as RequestInit["body"],
        signal: controller.signal,
        redirect: "follow",
      });
      return { status: res.status, ok: res.ok, json: <T>() => res.json() as Promise<T>, text: () => res.text() };
    } finally {
      clearTimeout(timer);
    }
  }
}

export type FakeRoute = (url: string, req: HttpRequest) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;

/** Test double: register handlers by URL prefix. Unknown URLs → 599 so tests fail loudly. */
export class FakeHttpClient implements HttpClient {
  readonly calls: Array<{ url: string; req: HttpRequest }> = [];
  private routes: Array<{ match: string | RegExp; handler: FakeRoute }> = [];
  on(match: string | RegExp, handler: FakeRoute): this {
    this.routes.push({ match, handler });
    return this;
  }
  async request(url: string, req: HttpRequest = {}): Promise<HttpResponse> {
    this.calls.push({ url, req });
    const route = this.routes.find((r) => (typeof r.match === "string" ? url.startsWith(r.match) : r.match.test(url)));
    if (!route) return { status: 599, ok: false, json: async <T>() => ({}) as T, text: async () => "no fake route" };
    const out = await route.handler(url, req);
    const status = out.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async <T>() => out.body as T,
      text: async () => (typeof out.body === "string" ? out.body : JSON.stringify(out.body)),
    };
  }
}
