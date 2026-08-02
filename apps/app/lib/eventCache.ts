// Leichter Persistenz-Cache für die Events-Query (ohne zusätzliche TanStack-Pakete).
// Beim App-Start gibt es so SOFORT die zuletzt geladenen Events (kein Spinner);
// im Hintergrund lädt React Query frische Daten und ersetzt sie still.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EventFeatureCollection } from "@moinkark/shared";

const CACHE_KEY = "kkd:eventsCache";

interface Cached {
  ts: number;
  data: EventFeatureCollection;
}

/** Berlin-lokales Datum („2026-08-02") eines Zeitstempels. */
function berlinDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export async function loadCachedEvents(): Promise<EventFeatureCollection | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (!c?.data) return null;

    // Der Cache gilt NUR für den Tag, an dem er geschrieben wurde — nicht 24h.
    // Grund: Bei wöchentlichen Serien (Gottesdienst, Chorproben) enthält der Cache
    // von gestern Abend noch die Instanz der VORWOCHE, aber noch nicht die von
    // heute. Zeigte man ihn trotzdem, stünde am Sonntagmorgen der Termin vom 5.8.
    // ganz oben statt des Gottesdienstes, der in zwei Stunden anfängt. Lieber kurz
    // den Spinner zeigen und auf frische Daten warten, als falsch sortiert starten.
    if (berlinDay(c.ts) !== berlinDay(Date.now())) return null;

    // Innerhalb desselben Tages: bereits beendete Termine rauswerfen, damit der
    // Cache nicht Vergangenes anzeigt (2h Kulanz ohne Endzeit — wie isPast).
    const now = Date.now();
    const features = c.data.features.filter((f) => {
      const start = new Date(f.properties.startUtc).getTime();
      const endRaw = f.properties.endUtc ? new Date(f.properties.endUtc).getTime() : NaN;
      const end = Number.isFinite(endRaw) && endRaw > start ? endRaw : start + 2 * 3600_000;
      return end >= now;
    });
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
