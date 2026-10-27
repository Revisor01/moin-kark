// Aggregiert Events aller 14 Orgs zu einem deduplizierten GeoJSON.

import {
  normalizeKey,
  type EventFeature,
  type EventFeatureCollection,
  type FeedCategory,
} from "@moinkark/shared";
import { fetchOrgEvents, fmtDate } from "./churchdesk.js";
import { toFeature } from "./geojson.js";
import { isDynamicallyExcludedCategory } from "./locations.js";
import { loadOrgs, missingOrgIds } from "./orgs.js";

/** Spezifität einer Org fürs Kirchspiel-Label bei Doppel-Events. */
function specificity(orgId: number): number {
  if (orgId === 2596) return 0; // Dach
  if ([2720, 2725, 2729, 6572].includes(orgId)) return 1; // Kirchspiele
  return 2; // Einzelgemeinden
}

/** Nicht öffentliche Kategorien (normalisiert); weitere lassen sich über /admin ausschließen. */
export const EXCLUDED_CATEGORIES = new Set<string>([
  "externe buchung",
  "interne veranstaltungen",
  "kirchengemeinderatssitzung",
  "amtshandlungen -intern-",
  "konfirmanden",
]);

/** Kategorie-Vergleich mit derselben Normalisierung wie /admin, sonst greifen Ausschlüsse bei doppelten Leerzeichen nicht. */
function isExcluded(ev: { categories?: { title: string }[] }): boolean {
  return (ev.categories ?? []).some((c) => {
    const t = normalizeKey(c.title);
    return EXCLUDED_CATEGORIES.has(t) || isDynamicallyExcludedCategory(t);
  });
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
  // IDs der ausgefallenen Orgs, sonst hielte die App deren Termine für abgesagt.
  const orgsFailedIds: number[] = [];
  // Map id → {feature, specificity} für Dedup mit „spezifischere Org gewinnt".
  const byId = new Map<number, { feature: EventFeature; spec: number }>();

  settled.forEach((r, i) => {
    const org = orgs[i];
    if (r.status !== "fulfilled") {
      orgsFailedIds.push(org.id);
      console.error(`[aggregate] Org ${org.id}: Fetch fehlgeschlagen:`, r.reason?.message ?? r.reason);
      return;
    }
    orgsOk++;
    const { events } = r.value;
    for (const ev of events) {
      // Ein kaputter Datensatz darf nicht den Refresh aller Gemeinden kippen.
      try {
        if (isExcluded(ev)) continue; // ausgeschlossene Kategorien (z.B. „Externe Buchung")
        const spec = specificity(org.id);
        const existing = byId.get(ev.id);
        if (existing && existing.spec >= spec) continue; // schon spezifischer erfasst
        byId.set(ev.id, { feature: toFeature(ev, org.id), spec });
      } catch (e: any) {
        console.error(
          `[aggregate] Org ${org.id}: Event ${ev?.id} übersprungen (unbrauchbarer Datensatz):`,
          e?.message ?? e
        );
      }
    }
  });

  // Bei Totalausfall werfen statt leer liefern, sonst ersetzen alle Geräte ihren Bestand durch nichts.
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
      // Das Fenster, das ChurchDesk wirklich bekommt: Berliner Kalendertage.
      windowFrom: fmtDate(from),
      windowTo: fmtDate(to),
      total: features.length,
      withEventCoords,
      withFallbackCoords: features.length - withEventCoords,
      orgsOk,
      orgsFailed: orgsFailedIds.length,
      orgsFailedIds,
      orgsConfigured: orgs.length,
      orgsMissing: missingOrgIds().length,
    },
  };
}

/** Kategorien für die Filter-Chips, nach Titel dedupliziert und mit Häufigkeit. */
export function extractCategories(
  fc: EventFeatureCollection
): FeedCategory[] {
  const map = new Map<string, FeedCategory>();
  for (const f of fc.features) {
    for (const c of f.properties.categories) {
      const key = normalizeKey(c.title);
      const existing = map.get(key);
      if (existing) existing.count++;
      else map.set(key, { title: c.title.trim(), color: c.color, count: 1 });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.title.localeCompare(b.title, "de")
  );
}
