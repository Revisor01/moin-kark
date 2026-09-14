// Reine Auswahl-Logik für den Pin-Tap — plattformneutral, ohne Karten-Abhängigkeit.
import type { EventFeature } from "@moinkark/shared";

/**
 * Wählt aus den Events an einer angetippten Koordinate den zeitlich nächsten.
 *
 * Nötig, weil an einem Ort viele Events auf EXAKT derselben Koordinate liegen
 * (St. Bartholomäus Wesselburen: 13 Termine). MapLibre meldet dann entweder nur
 * den obersten Pin oder mehrere in beliebiger Reihenfolge — in beiden Fällen ist
 * `features[0]` Zufall. Darum: alle Events an dieser Koordinate aus den Daten
 * heraussuchen und den nehmen, der als nächstes stattfindet.
 *
 * @param features  Alle aktuell auf der Karte liegenden Events.
 * @param spot      Koordinate des getroffenen Pins als [lng, lat] — kann fehlen.
 * @param fallbackIds  IDs der von der Karte gemeldeten Treffer, in Meldereihenfolge.
 *   Greifen nur, wenn an `spot` kein Event liegt (die Karte liefert Koordinaten
 *   mitunter kachelgenau gerundet, dann trifft der exakte Vergleich nicht).
 * @returns Die Event-ID oder null, wenn sich nichts Sinnvolles auswählen lässt —
 *   NIE NaN: Vorher lief im Web `Number(undefined)` bis in die Auswahl durch, und
 *   das Sheet öffnete ohne Inhalt.
 */
export function pickNearestAtSpot(
  features: EventFeature[],
  spot: [number, number] | undefined,
  fallbackIds: number[]
): number | null {
  const [hlng, hlat] = spot ?? [];

  // Alle Events auf derselben Koordinate einsammeln (nicht nur die gemeldeten).
  const sameSpot = features.filter((f) => {
    const [lng, lat] = f.geometry.coordinates;
    return lng === hlng && lat === hlat;
  });

  const ids = new Set(fallbackIds.filter(Number.isFinite));
  const candidates =
    sameSpot.length > 0 ? sameSpot : features.filter((f) => ids.has(f.properties.id));

  if (candidates.length === 0) {
    // Ohne Kandidaten lieber gar nichts auswählen als eine NaN-ID.
    const raw = fallbackIds[0];
    return Number.isFinite(raw) ? raw : null;
  }

  // Frühester Start gewinnt. Vergangene sind hier bereits ausgefiltert
  // (applyFilters/isPast laufen vor der Übergabe an die Karte).
  let best = candidates[0];
  for (const f of candidates) {
    if (new Date(f.properties.startUtc) < new Date(best.properties.startUtc)) best = f;
  }
  return best.properties.id;
}
