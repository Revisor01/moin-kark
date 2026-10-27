// Persistenz-Cache der Events, damit der Start ohne Spinner den letzten Stand zeigt.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EventFeatureCollection } from "@moinkark/shared";
import { isPast } from "./filters";

const CACHE_KEY = "kkd:eventsCache";

interface Cached {
  ts: number;
  data: EventFeatureCollection;
}

// Nach einer Woche ist der Fehlerscreen ehrlicher als eine fast leere Karte.
const MAX_AGE_MS = 7 * 86400_000;

export async function loadCachedEvents(): Promise<EventFeatureCollection | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (!c?.data) return null;

    // Auch ein Stand von gestern ist offline besser als der Fehlerscreen; isPast wirft Gelaufenes raus.
    if (Date.now() - c.ts > MAX_AGE_MS) return null;

    // Bereits beendete Termine rauswerfen, damit der Cache nicht Vergangenes anzeigt.
    const now = new Date();
    const features = c.data.features.filter((f) => !isPast(f, now));
    return { ...c.data, features };
  } catch {
    return null;
  }
}

export async function saveCachedEvents(data: EventFeatureCollection): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}
