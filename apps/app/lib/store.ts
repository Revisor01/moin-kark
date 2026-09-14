// Lokaler Speicher (AsyncStorage) für Profil-Einstellungen + gemerkte Events.
// Kein Backend, kein Login — alles bleibt auf dem Gerät.
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

export type MapsApp = "apple" | "google";

const SAVED_KEY = "kkd:savedEvents";
const MAPS_KEY = "kkd:mapsApp";

// --- Gemerkte Events (Set von Event-IDs) ---

/** Änderung, die eintraf, bevor die gespeicherte Liste gelesen war. */
type PendingOp = { kind: "toggle"; id: number } | { kind: "remove"; ids: number[] };

function parseSaved(raw: string | null): Set<number> {
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function applyPending(base: Set<number>, ops: PendingOp[]): Set<number> {
  const next = new Set(base);
  for (const op of ops) {
    if (op.kind === "toggle") {
      if (next.has(op.id)) next.delete(op.id);
      else next.add(op.id);
    } else {
      for (const id of op.ids) next.delete(id);
    }
  }
  return next;
}

function persist(set: Set<number>) {
  AsyncStorage.setItem(SAVED_KEY, JSON.stringify([...set])).catch(() => {});
}

export function useSavedEvents() {
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);
  // Änderungen vor dem Lesen des Speichers (Herz-Tipp direkt nach dem Start)
  // werden gepuffert, nach dem Laden auf die gelesene Liste angewendet und
  // dann EINMAL geschrieben. Schriebe der Tipp sofort, überschriebe er die
  // gespeicherte Liste mit dem noch leeren Set — und die Leseantwort danach
  // den Zustand mit der alten Liste: verlorener Schreibvorgang in beide Richtungen.
  const loadedRef = useRef(false);
  const pendingRef = useRef<PendingOp[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(SAVED_KEY)
      // Lesefehler (beschädigter Speicher) = leere Liste, aber trotzdem „geladen":
      // sonst warteten Abgleich und Aufräumen für immer.
      .then(parseSaved, () => new Set<number>())
      .then((stored) => {
        const ops = pendingRef.current;
        pendingRef.current = [];
        const merged = applyPending(stored, ops);
        setSaved(merged);
        if (ops.length) persist(merged);
      })
      .catch(() => {})
      .finally(() => {
        loadedRef.current = true;
        setLoaded(true);
      });
  }, []);

  const toggle = useCallback((id: number) => {
    const persistNow = loadedRef.current;
    if (!persistNow) pendingRef.current.push({ kind: "toggle", id });
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (persistNow) persist(next);
      return next;
    });
  }, []);

  const isSaved = useCallback((id: number) => saved.has(id), [saved]);

  // Mehrere IDs auf einmal entfernen (z. B. vergangene Events automatisch aufräumen).
  const removeMany = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    const persistNow = loadedRef.current;
    if (!persistNow) pendingRef.current.push({ kind: "remove", ids });
    setSaved((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ids) {
        if (next.delete(id)) changed = true;
      }
      if (!changed) return prev;
      if (persistNow) persist(next);
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
      .catch(() => {})
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
    AsyncStorage.getItem(MAPS_KEY)
      .then((raw) => {
        if (raw === "apple" || raw === "google") setMapsAppState(raw);
      })
      .catch(() => {}); // Lesefehler → Vorbelegung bleibt
  }, []);

  const setMapsApp = useCallback((v: MapsApp) => {
    setMapsAppState(v);
    AsyncStorage.setItem(MAPS_KEY, v).catch(() => {});
  }, []);

  return { mapsApp, setMapsApp };
}
