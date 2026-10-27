import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { EventFeatureCollection } from "@moinkark/shared";
import { fetchCategories, fetchEvents, fetchVersion } from "../api";
import { loadCachedEvents, saveCachedEvents } from "../eventCache";

/** Heutiges Berlin-Datum („2026-08-02") — Tageswechsel ist die Refetch-Grenze. */
function berlinDay(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function useEvents() {
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
    // Immer gegen den Server prüfen, sonst kommen frische Highlights erst Minuten später an.
    staleTime: 0,
  });

  // Frische Netz-Daten persistieren, sobald sie ankommen.
  useEffect(() => {
    if (query.isSuccess && query.data) saveCachedEvents(query.data);
  }, [query.isSuccess, query.dataUpdatedAt]);

  // Bei Tageswechsel aus dem Hintergrund neu laden; refetchOnMount greift dort nicht.
  const refetch = query.refetch;
  const dayRef = useRef(berlinDay());
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const today = berlinDay();
      if (today !== dayRef.current) {
        dayRef.current = today;
        refetch();
      }
    });
    return () => sub.remove();
  }, [refetch]);

  // Alle 5 Minuten /version.json, das volle GeoJSON nur bei Änderung; nur im Vordergrund.
  const versionRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (AppState.currentState !== "active") return;
      try {
        const v = await fetchVersion();
        if (cancelled) return;
        if (versionRef.current === null) {
          versionRef.current = v; // erster Lauf: nur merken
        } else if (versionRef.current !== v) {
          versionRef.current = v;
          refetch();
        }
      } catch {
        // Netzfehler ignorieren — beim nächsten Durchlauf erneut versuchen.
      }
    };
    const id = setInterval(check, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refetch]);

  // Echte Daten haben Vorrang; bis sie da sind, zeigen wir den Cache.
  const data = query.data ?? cached ?? undefined;
  // Spinner nur ohne Daten und ohne Cache, nach dem Cache-Check.
  const isLoading = !data && (!cacheChecked || query.isLoading);
  // Fehlerseite nur, wenn gar nichts anzuzeigen ist.
  const isError = query.isError && !data;

  return { ...query, data, isLoading, isError };
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
}
