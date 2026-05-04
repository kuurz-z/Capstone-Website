/**
 * =============================================================================
 * TANSTACK QUERY CLIENT — Global Configuration
 * =============================================================================
 *
 * Shared QueryClient instance used by both tenant and admin entry points.
 * Configures sensible defaults for caching, retries, and refetching.
 *
 * =============================================================================
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes — data stays fresh
      gcTime: 10 * 60 * 1000, // 10 minutes — garbage collection
      retry: 1, // Retry failed requests once
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      refetchOnReconnect: true, // Refetch on network reconnect
    },
    mutations: {
      retry: 0, // Don't retry mutations (avoid double-submits)
    },
  },
});
