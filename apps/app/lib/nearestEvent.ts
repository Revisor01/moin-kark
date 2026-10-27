// Reine Auswahl-Logik für den Pin-Tap — plattformneutral, ohne Karten-Abhängigkeit.
import type { EventFeature } from "@moinkark/shared";

/** Zeitlich nächstes Event an einer Koordinate, weil `features[0]` bei deckungsgleichen Pins Zufall ist; nie NaN. */
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

  // Vergangene sind hier schon ausgefiltert.
  let best = candidates[0];
  for (const f of candidates) {
    if (new Date(f.properties.startUtc) < new Date(best.properties.startUtc)) best = f;
  }
  return best.properties.id;
}
