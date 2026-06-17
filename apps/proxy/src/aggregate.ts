// Aggregiert Events über alle 14 Orgs parallel, dedupliziert über event.id,
// baut eine GeoJSON-FeatureCollection.

import type { EventFeature, EventFeatureCollection } from "@kkd/shared";
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
      const spec = specificity(org.id);
      const existing = byId.get(ev.id);
      if (existing && existing.spec >= spec) continue; // schon spezifischer erfasst
      byId.set(ev.id, { feature: toFeature(ev, org.id), spec });
    }
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
