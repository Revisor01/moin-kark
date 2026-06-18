// Lokaler Speicher (AsyncStorage) für Profil-Einstellungen + gemerkte Events.
// Kein Backend, kein Login — alles bleibt auf dem Gerät.
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

  const persist = useCallback((next: Set<number>) => {
    setSaved(next);
    AsyncStorage.setItem(SAVED_KEY, JSON.stringify([...next])).catch(() => {});
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

  return { saved, isSaved, toggle, persist, loaded };
}

// --- Karten-App-Präferenz ---
export function useMapsApp() {
  const [mapsApp, setMapsAppState] = useState<MapsApp>("apple");

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
