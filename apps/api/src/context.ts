import type { AppConfig } from "./config";
import type { HttpClient } from "./lib/http";

/** Dependencies injected into every module (tests swap `http` for a FakeHttpClient). */
export interface AppContext {
  config: AppConfig;
  http: HttpClient;
  now: () => Date;
}
