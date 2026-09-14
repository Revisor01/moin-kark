// Aggregiert Events über alle 14 Orgs parallel, dedupliziert über event.id,
// baut eine GeoJSON-FeatureCollection.

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
 * - "kirchengemeinderatssitzung": manche Orgs (Nordhastedt) pflegen KGR als eigene Kategorie.
 * - "amtshandlungen -intern-": im Namen schon intern (NICHT die normalen „amtshandlungen" = öffentl. Tauffeste).
 * - "konfirmanden": wiederkehrender Konfi-Unterricht für angemeldete Konfis, kein offenes Event.
 *
 * Zusätzlich lassen sich über /admin weitere Kategorien zur Laufzeit ausschließen.
 */
export const EXCLUDED_CATEGORIES = new Set<string>([
  "externe buchung",
  "interne veranstaltungen",
  "kirchengemeinderatssitzung",
  "amtshandlungen -intern-",
  "konfirmanden",
]);

/**
 * Kategorie-Vergleich mit derselben Normalisierung, mit der /admin die
 * Ausschlüsse speichert (normalizeKey kollabiert auch innere Leerzeichen).
 * ChurchDesk liefert Namen mit doppelten Leerzeichen — mit einer zweiten,
 * abweichenden Normalisierung zeigte die Oberfläche den Ausschluss als aktiv,
 * die Termine blieben aber im Feed.
 */
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
  // Welche Orgs ausgefallen sind, nicht nur wie viele: Die App merkt sich
  // Termine und meldet Absagen — ohne die IDs hielte sie jeden Termin einer
  // fehlenden Gemeinde für entfallen.
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
      // Je Event abgesichert: Ein einziger kaputter Datensatz (z. B. Kategorie
      // mit `title: null`) darf nicht den Refresh für alle Gemeinden kippen —
      // Fetch-Fehler sind je Org isoliert, das hier ist das Gegenstück je Event.
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

/**
 * Kategorienliste für Filter-Chips, dedupliziert nach normalisiertem TITEL
 * (jede Org vergibt eigene IDs/Schreibweisen für denselben Namen). Liefert
 * Häufigkeit mit, damit das UI nach Relevanz sortieren kann.
 */
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
