"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { ApiClientError } from "@fitfloow/api-client";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/Toast";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Never retry auth/permission/validation problems — only flaky transport.
          if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <ThemeProvider>
      {/* reducedMotion="user" makes every motion component honour prefers-reduced-motion. */}
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
