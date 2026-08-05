// Leichter Persistenz-Cache für die Events-Query (ohne zusätzliche TanStack-Pakete).
// Beim App-Start gibt es so SOFORT die zuletzt geladenen Events (kein Spinner);
// im Hintergrund lädt React Query frische Daten und ersetzt sie still.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EventFeatureCollection } from "@moinkark/shared";
import { isPast } from "./filters";

const CACHE_KEY = "kkd:eventsCache";

interface Cached {
  ts: number;
  data: EventFeatureCollection;
}

// Nach einer Woche ist der Bestand so lückenhaft (neue Termine fehlen, Serien
// ausgedünnt), dass der Fehlerscreen ehrlicher ist als eine fast leere Karte.
const MAX_AGE_MS = 7 * 86400_000;

export async function loadCachedEvents(): Promise<EventFeatureCollection | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (!c?.data) return null;

    // Auch ein Stand von gestern ist als Offline-Start besser als der Fehlerscreen
    // („Wer morgens im Funkloch öffnet, sieht sonst gar nichts"). Der isPast-Filter
    // darunter wirft bereits Gelaufenes raus — auch die Vorwochen-Instanzen
    // wöchentlicher Serien, die früher der Grund für den harten Tageswechsel-
    // Verwurf waren. Sobald Netz da ist, ersetzt React Query den Stand still.
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
