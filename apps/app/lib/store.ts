// Lokaler Speicher (AsyncStorage) für Profil-Einstellungen + gemerkte Events.
// Kein Backend, kein Login — alles bleibt auf dem Gerät.
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export type MapsApp = "apple" | "google";

const SAVED_KEY = "kkd:savedEvents";
const MAPS_KEY = "kkd:mapsApp";

// --- Gemerkte Events (Set von Event-IDs) ---
export function useSavedEvents() {
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SAVED_KEY).then((raw) => {
      if (raw) {
        try {
          setSaved(new Set(JSON.parse(raw) as number[]));
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const toggle = useCallback(
    (id: number) => {
      setSaved((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        AsyncStorage.setItem(SAVED_KEY, JSON.stringify([...next])).catch(() => {});
        return next;
      });
    },
    []
  );

  const isSaved = useCallback((id: number) => saved.has(id), [saved]);

  // Mehrere IDs auf einmal entfernen (z. B. vergangene Events automatisch aufräumen).
  const removeMany = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setSaved((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ids) {
        if (next.delete(id)) changed = true;
      }
      if (!changed) return prev;
      AsyncStorage.setItem(SAVED_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  return { saved, isSaved, toggle, removeMany, loaded };
}

// --- Erinnerungs-Präferenz ---
import {
  DEFAULT_REMINDER,
  getReminderPref,
  setReminderPref as persistReminderPref,
  type ReminderPref,
} from "./reminders";

export function useReminderPref() {
  const [pref, setPrefState] = useState<ReminderPref>(DEFAULT_REMINDER);
  // `loaded` unterscheidet „noch nicht gelesen" von „gelesen, ist der Default".
  // Ohne das plant der Abgleich beim Start womöglich Erinnerungen anhand des
  // Defaults, obwohl die Person sie auf „Aus" gestellt hat.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getReminderPref()
      .then(setPrefState)
      .finally(() => setLoaded(true));
  }, []);
  const setPref = useCallback((p: ReminderPref) => {
    setPrefState(p);
    persistReminderPref(p);
  }, []);
  return { pref, setPref, loaded };
}

// --- Karten-App-Präferenz ---

/**
 * Vorbelegung nach Plattform: Apple Karten gibt es nur auf iOS. Stand hier
 * pauschal "apple", landeten Android-Nutzer über einen Button namens
 * „In Apple Karten öffnen" im Browser statt in ihrer Google-Maps-App.
 */
const DEFAULT_MAPS_APP: MapsApp = Platform.OS === "ios" ? "apple" : "google";

export function useMapsApp() {
  const [mapsApp, setMapsAppState] = useState<MapsApp>(DEFAULT_MAPS_APP);

  useEffect(() => {
    AsyncStorage.getItem(MAPS_KEY).then((raw) => {
      if (raw === "apple" || raw === "google") setMapsAppState(raw);
    });
  }, []);

  const setMapsApp = useCallback((v: MapsApp) => {
    setMapsAppState(v);
    AsyncStorage.setItem(MAPS_KEY, v).catch(() => {});
  }, []);

  return { mapsApp, setMapsApp };
}
