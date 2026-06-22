// Reine, testbare Filterlogik. Wirkt clientseitig auf das gecachte GeoJSON — kein Refetch.

import type { EventFeature } from "@kkd/shared";

export type DateFilter = "all" | "today" | "week" | "weekend";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Filters {
  date: DateFilter;
  /** Normalisierter Kategorie-Titel (lowercase) oder null = alle. */
  category: string | null;
  /** Kirchspiel-Name (exakt) oder null = alle. */
  kirchspiel: string | null;
  /** Kirchengemeinde (parish, exakt) oder null = alle. Nur sinnvoll mit gewähltem Kirchspiel. */
  parish: string | null;
  /** „Tipps"-Modus: nur Highlight-Events, über ALLE Zeiten (Datumsfilter aus). */
  highlightsOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  date: "week", // Vorauswahl: diese Woche — sonst sind die Cluster riesig
  category: null,
  kirchspiel: null,
  parish: null,
  highlightsOnly: false,
};

/** Umkreis-Radius für „In meiner Nähe" in Kilometern. */
export const NEARBY_RADIUS_KM = 10;

/** Haversine-Distanz in km zwischen zwei Punkten. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

function inBounds(f: EventFeature, b: Bounds): boolean {
  const [lng, lat] = f.geometry.coordinates;
  return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
}

const BERLIN_TZ = "Europe/Berlin";

/** Berlin-lokales Datum (Jahr/Monat/Tag) eines UTC-ISO-Strings. */
function berlinParts(utc: string): { y: number; m: number; d: number; dow: number } {
  const date = new Date(utc);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    dow: dowMap[get("weekday")] ?? 0,
  };
}

function sameDay(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }) {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

function matchesDate(startUtc: string, filter: DateFilter, now: Date): boolean {
  if (filter === "all") return true;
  const ev = berlinParts(startUtc);
  const today = berlinParts(now.toISOString());

  if (filter === "today") return sameDay(ev, today);

  if (filter === "weekend") {
    // Kommendes Sa/So (inkl. heute, falls Wochenende).
    if (ev.dow !== 6 && ev.dow !== 0) return false;
    return isWithinDays(startUtc, now, 7);
  }

  if (filter === "week") return isWithinDays(startUtc, now, 7);
  return true;
}

function isWithinDays(startUtc: string, now: Date, days: number): boolean {
  const start = new Date(startUtc).getTime();
  const from = now.getTime();
  const to = from + days * 86400_000;
  // Vergangenes filtert bereits isPast() (über die Endzeit) — hier nur das Fenster nach vorn.
  return start <= to;
}

function matchesCategory(f: EventFeature, category: string | null): boolean {
  if (!category) return true;
  return f.properties.categories.some((c) => c.title.trim().toLowerCase() === category);
}

export interface FilterContext {
  now?: Date;
  /** Eigener Standort — nötig für den Umkreis-Filter. */
  location?: LatLng | null;
  /** Sichtbarer Karten-Ausschnitt — Liste folgt der Karte, wenn gesetzt. */
  bounds?: Bounds | null;
}

/** Ist das Event vorbei? Maßgeblich ist die Endzeit; fehlt sie, Start + 2h Kulanz. */
export function isPast(f: EventFeature, now: Date = new Date()): boolean {
  const start = new Date(f.properties.startUtc).getTime();
  const endRaw = f.properties.endUtc ? new Date(f.properties.endUtc).getTime() : NaN;
  const end = Number.isFinite(endRaw) && endRaw > start ? endRaw : start + 2 * 3600_000;
  return end < now.getTime();
}

export function applyFilters(
  features: EventFeature[],
  filters: Filters,
  ctx: FilterContext = {}
): EventFeature[] {
  const now = ctx.now ?? new Date();
  return features.filter((f) => {
    // Vergangene Events IMMER raus (Endzeit liegt in der Vergangenheit).
    if (isPast(f, now)) return false;
    // Tipps-Modus: nur Highlights, über alle künftigen Termine (Datumsfilter aus).
    if (filters.highlightsOnly) {
      if (!f.properties.highlight) return false;
    } else {
      if (!matchesDate(f.properties.startUtc, filters.date, now)) return false;
    }
    if (!matchesCategory(f, filters.category)) return false;
    if (filters.kirchspiel && f.properties.kirchspiel !== filters.kirchspiel) return false;
    if (filters.parish && f.properties.parish !== filters.parish) return false;
    if (ctx.bounds && !inBounds(f, ctx.bounds)) return false;
    return true;
  });
}

/** Sortiert nach Startzeit aufsteigend. */
export function sortByStart(features: EventFeature[]): EventFeature[] {
  return [...features].sort(
    (a, b) => new Date(a.properties.startUtc).getTime() - new Date(b.properties.startUtc).getTime()
  );
}

/** Formatiert Start (+ optional Ende) in Berlin-Zeit, deutsch. */
export function formatEventTime(startUtc: string, endUtc?: string, allDay?: boolean, showEnd = true): string {
  const start = new Date(startUtc);
  const dateFmt = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const timeFmt = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  const datePart = dateFmt.format(start);
  if (allDay) return `${datePart} · ganztägig`;
  const startTime = timeFmt.format(start);
  if (showEnd && endUtc) {
    const end = new Date(endUtc);
    // Endzeit nur zeigen, wenn am selben Tag.
    const sameDayEnd = berlinParts(startUtc).d === berlinParts(endUtc).d;
    if (sameDayEnd) return `${datePart} · ${startTime}–${timeFmt.format(end)} Uhr`;
  }
  return `${datePart} · ${startTime} Uhr`;
}
