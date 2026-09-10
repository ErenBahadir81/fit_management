import React from "react";
import { render, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "../src/theme";
import { ToastProvider } from "../src/ui/Toast";

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 }, mutations: { retry: false } } });
}

export function Providers({ children, queryClient }: { children: React.ReactNode; queryClient?: QueryClient }) {
  const qc = React.useMemo(() => queryClient ?? makeQueryClient(), [queryClient]);
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export function renderUI(ui: React.ReactElement, opts?: { queryClient?: QueryClient }) {
  return render(ui, { wrapper: ({ children }) => <Providers queryClient={opts?.queryClient}>{children}</Providers> });
}

export function renderHookUI<T>(cb: () => T, opts?: { queryClient?: QueryClient }) {
  return renderHook(cb, { wrapper: ({ children }) => <Providers queryClient={opts?.queryClient}>{children}</Providers> });
}
