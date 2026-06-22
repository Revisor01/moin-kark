import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EventFeatureCollection } from "@kkd/shared";
import { fetchCategories, fetchEvents } from "../api";
import { loadCachedEvents, saveCachedEvents } from "../eventCache";

export function useEvents() {
  // Persistierter Cache aus AsyncStorage: liegt er vor, zeigen wir ihn SOFORT
  // (kein Spinner) während React Query im Hintergrund frische Daten holt.
  const [cached, setCached] = useState<EventFeatureCollection | null>(null);
  const [cacheChecked, setCacheChecked] = useState(false);

  useEffect(() => {
    loadCachedEvents().then((c) => {
      setCached(c);
      setCacheChecked(true);
    });
  }, []);

  const query = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
  });

  // Frische Netz-Daten persistieren, sobald sie ankommen.
  useEffect(() => {
    if (query.isSuccess && query.data) saveCachedEvents(query.data);
  }, [query.isSuccess, query.dataUpdatedAt]);

  // Echte Daten haben Vorrang; bis sie da sind, zeigen wir den Cache.
  const data = query.data ?? cached ?? undefined;
  // Spinner nur, wenn weder frische Daten noch Cache vorliegen
  // (und der Cache-Check schon gelaufen ist, damit kein Aufblitzen entsteht).
  const isLoading = !data && (!cacheChecked || query.isLoading);

  return { ...query, data, isLoading };
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
}
