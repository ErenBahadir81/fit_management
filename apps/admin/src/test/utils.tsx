import type { ReactElement } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import type { ApiClient } from "@fitfloow/api-client";
import { __setApiClient } from "@/lib/api";
import { createFakeApiClient, createFakeState, type FakeState } from "@/lib/fake/client";
import { ToastProvider } from "@/components/ui/Toast";

/** Fresh QueryClient per test: no retries, no caching between cases. */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export interface TestHarness {
  queryClient: QueryClient;
  state: FakeState;
  api: ApiClient;
}

/** Installs a zero-latency in-memory API for the module under test. */
export function installFakeApi(overrides?: Partial<FakeState>): { state: FakeState; api: ApiClient } {
  const state = { ...createFakeState(), ...overrides };
  const api = createFakeApiClient({ latencyMs: 0, state, signedIn: true });
  __setApiClient(api);
  return { state, api };
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions & { queryClient?: QueryClient } = {}
): RenderResult & { queryClient: QueryClient } {
  const { queryClient = makeTestQueryClient(), ...rest } = options;
  const result = render(
    <MotionConfig reducedMotion="always">
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MotionConfig>,
    rest
  );
  return { ...result, queryClient };
}
