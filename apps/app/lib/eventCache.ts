// Leichter Persistenz-Cache für die Events-Query (ohne zusätzliche TanStack-Pakete).
// Beim App-Start gibt es so SOFORT die zuletzt geladenen Events (kein Spinner);
// im Hintergrund lädt React Query frische Daten und ersetzt sie still.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EventFeatureCollection } from "@kkd/shared";

const CACHE_KEY = "kkd:eventsCache";

interface Cached {
  ts: number;
  data: EventFeatureCollection;
}

// Cache max. 24h als Start-Anzeige akzeptieren — danach lieber frisch warten.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function loadCachedEvents(): Promise<EventFeatureCollection | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (!c?.data || Date.now() - c.ts > MAX_AGE_MS) return null;
    return c.data;
  } catch {
    return null;
  }
}

export async function saveCachedEvents(data: EventFeatureCollection): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}
