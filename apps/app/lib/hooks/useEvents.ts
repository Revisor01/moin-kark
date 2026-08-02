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
    // Events IMMER gegen den Server prüfen, auch wenn Cache-Daten vorliegen.
    // Redaktionelle Änderungen (Highlight gesetzt, Titel korrigiert, Termin
    // abgesagt) müssen zeitnah ankommen — mit staleTime galten frisch gesetzte
    // Highlights als „noch frisch genug" und tauchten erst Minuten später auf.
    // Der persistierte Cache verhindert dabei den Spinner: er wird sofort
    // angezeigt und still ersetzt, sobald die Netz-Antwort da ist.
    staleTime: 0,
  });

  // Frische Netz-Daten persistieren, sobald sie ankommen.
  useEffect(() => {
    if (query.isSuccess && query.data) saveCachedEvents(query.data);
  }, [query.isSuccess, query.dataUpdatedAt]);

  // Zurück aus dem Hintergrund → neu laden, wenn sich der (Berlin-)Tag geändert hat.
  // Ohne das startet die App am Sonntagmorgen mit dem Stand von gestern Abend: der
  // Gottesdienst von heute fehlt, stattdessen steht ein Termin nächste Woche oben.
  // refetchOnMount greift hier NICHT — beim Wechsel aus dem Hintergrund mountet nichts neu.
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

  // Stille Änderungs-Abfrage alle 5 Minuten: /version.json ist ein paar Bytes
  // groß (Hash über den Datenbestand). Nur wenn er sich ändert, wird das volle
  // GeoJSON (~700 KB) nachgeladen. So sind redaktionelle Korrekturen zeitnah da,
  // ohne die Geräte im Minutentakt den ganzen Feed ziehen zu lassen.
  // Läuft nur im Vordergrund — im Hintergrund gibt es nichts anzuzeigen.
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
  // Spinner nur, wenn weder frische Daten noch Cache vorliegen
  // (und der Cache-Check schon gelaufen ist, damit kein Aufblitzen entsteht).
  const isLoading = !data && (!cacheChecked || query.isLoading);
  // Fehlerseite NUR, wenn wir wirklich nichts zeigen können. Schlägt der
  // Netz-Fetch fehl, wir haben aber Cache-Daten → still anzeigen statt „Nanu".
  const isError = query.isError && !data;

  return { ...query, data, isLoading, isError };
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
}
