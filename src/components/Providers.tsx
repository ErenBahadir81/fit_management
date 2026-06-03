"use client";

import { SWRConfig } from "swr";
import { fetcher } from "@/lib/fetcher";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 1500,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
