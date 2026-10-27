import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5 Minuten, damit der Gottesdienst von heute früh beim erneuten Öffnen auftaucht; der Server cacht 20.
      staleTime: 5 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: "always",
      refetchOnReconnect: "always",
    },
  },
});
