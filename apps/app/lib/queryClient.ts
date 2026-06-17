import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Proxy cached server-seitig 20 min; Client hält 15 min frisch.
      staleTime: 15 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
