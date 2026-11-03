"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

const queryDefaults = {
  queries: {
    // Realtime invalidation is the primary refresh path. This window prevents
    // repeated reads when the user moves between pages without a database change.
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  },
};

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: queryDefaults }));

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
