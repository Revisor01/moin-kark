// Aggregiert Events über alle 14 Orgs parallel, dedupliziert über event.id,
// baut eine GeoJSON-FeatureCollection.

import type { EventFeature, EventFeatureCollection } from "@moinkark/shared";
import { fetchOrgEvents } from "./churchdesk.js";
import { toFeature } from "./geojson.js";
import { loadOrgs } from "./orgs.js";

/**
 * Spezifität einer Org fürs Kirchspiel-Label bei Doppel-Events:
 * Einzelgemeinde-Orgs sind spezifischer als Kirchspiel-Orgs, das Dach ist am unspezifischsten.
 */
function specificity(orgId: number): number {
  if (orgId === 2596) return 0; // Dach
  if ([2720, 2725, 2729, 6572].includes(orgId)) return 1; // Kirchspiele
  return 2; // Einzelgemeinden
}

/**
 * Kategorien, die NICHT öffentlich auf der Karte erscheinen sollen (normalisiert, lowercase).
 * → siehe knowledge / Memory: ausgeschlossene Inhalte. Alle Stand 19.06.2026 (Simons Vorgabe).
 * - "externe buchung": Fremdnutzungen der Räume (DRK-Yoga, SSV, Liedertafel-Proben etc., v.a. Nordhastedt).
 * - "interne veranstaltungen": z.B. Kirchengemeinderatssitzung — nicht öffentlich.
 * - "amtshandlungen -intern-": im Namen schon intern (NICHT die normalen „amtshandlungen" = öffentl. Tauffeste).
 * - "konfirmanden": wiederkehrender Konfi-Unterricht für angemeldete Konfis, kein offenes Event.
 */
const EXCLUDED_CATEGORIES = new Set<string>([
  "externe buchung",
  "interne veranstaltungen",
  "amtshandlungen -intern-",
  "konfirmanden",
]);

function isExcluded(ev: { categories?: { title: string }[] }): boolean {
  return (ev.categories ?? []).some((c) =>
    EXCLUDED_CATEGORIES.has(c.title.trim().toLowerCase())
  );
}

export async function buildFeatureCollection(
  from: Date,
  to: Date
): Promise<EventFeatureCollection> {
  const orgs = loadOrgs();

  const settled = await Promise.allSettled(
    orgs.map((org) => fetchOrgEvents(org, from, to).then((events) => ({ org, events })))
  );

  let orgsOk = 0;
  let orgsFailed = 0;
  // Map id → {feature, specificity} für Dedup mit „spezifischere Org gewinnt".
  const byId = new Map<number, { feature: EventFeature; spec: number }>();

  for (const r of settled) {
    if (r.status !== "fulfilled") {
      orgsFailed++;
      console.error("[aggregate] Org-Fetch fehlgeschlagen:", r.reason?.message ?? r.reason);
      continue;
    }
    orgsOk++;
    const { org, events } = r.value;
    for (const ev of events) {
      if (isExcluded(ev)) continue; // ausgeschlossene Kategorien (z.B. „Externe Buchung")
      const spec = specificity(org.id);
      const existing = byId.get(ev.id);
      if (existing && existing.spec >= spec) continue; // schon spezifischer erfasst
      byId.set(ev.id, { feature: toFeature(ev, org.id), spec });
    }
  }

  // Totalausfall (ChurchDesk-Wartungsfenster, Netzstörung): NICHT erfolgreich eine
  // leere Collection liefern — die würde den Cache überschreiben, den Versions-Hash
  // ändern und alle Geräte ihren lokalen Bestand mit nichts ersetzen lassen.
  // Ein Fehler lässt stattdessen die Stale-Logik des SwrCache greifen.
  if (orgsOk === 0) {
    throw new Error(`Alle ${orgs.length} Org-Fetches fehlgeschlagen — alter Datenstand bleibt stehen.`);
  }

  const features = [...byId.values()].map((v) => v.feature);
  const withEventCoords = features.filter((f) => f.properties.coordSource === "event").length;

  return {
    type: "FeatureCollection",
    features,
    meta: {
      generatedAt: new Date().toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
      total: features.length,
      withEventCoords,
      withFallbackCoords: features.length - withEventCoords,
      orgsOk,
      orgsFailed,
    },
  };
}

/**
 * Kategorienliste für Filter-Chips, dedupliziert nach normalisiertem TITEL
 * (jede Org vergibt eigene IDs/Schreibweisen für denselben Namen). Liefert
 * Häufigkeit mit, damit das UI nach Relevanz sortieren kann.
 */
export function extractCategories(
  fc: EventFeatureCollection
): { title: string; color: number; count: number }[] {
  const map = new Map<string, { title: string; color: number; count: number }>();
  for (const f of fc.features) {
    for (const c of f.properties.categories) {
      const key = c.title.trim().toLowerCase();
      const existing = map.get(key);
      if (existing) existing.count++;
      else map.set(key, { title: c.title.trim(), color: c.color, count: 1 });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.title.localeCompare(b.title, "de")
  );
}
