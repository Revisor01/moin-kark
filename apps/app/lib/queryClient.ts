import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Proxy cached server-seitig 20 min; Client hält 5 min frisch.
      // Bewusst kurz: Bei „Heute"/„Diese Woche" entscheidet Aktualität darüber, ob
      // der Gottesdienst von heute Vormittag überhaupt auftaucht. Mit 15 min hat
      // die App beim erneuten Öffnen gar nicht nachgeladen und blieb auf dem alten
      // Stand stehen. Der Server-Cache (20 min) fängt die Last ohnehin ab.
      staleTime: 5 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      // Beim Öffnen/Mounten immer gegen den Server prüfen — sonst startet die App
      // mit veralteten Daten in den Tag.
      refetchOnMount: "always",
      refetchOnReconnect: "always",
    },
  },
});
