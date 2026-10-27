// Reine, testbare Filterlogik. Wirkt clientseitig auf das gecachte GeoJSON — kein Refetch.

import { eventParishes, type EventFeature, type LatLng } from "@moinkark/shared";

export type DateFilter = "all" | "today" | "week" | "weekend" | "range";

// Nur weitergereicht, damit Importe aus ./filters gelten.
export type { LatLng };

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
  /** Eigener Zeitraum, erster Tag als `YYYY-MM-DD` (Berliner Kalendertag). Nur bei `date: "range"`. */
  rangeFrom?: string;
  /** Eigener Zeitraum, letzter Tag als `YYYY-MM-DD` — einschließlich. */
  rangeTo?: string;
}

export const DEFAULT_FILTERS: Filters = {
  date: "week", // Vorauswahl: diese Woche — sonst sind die Cluster riesig
  category: null,
  kirchspiel: null,
  parish: null,
  highlightsOnly: false,
};

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

/** Ob ein Punkt grob in Dithmarschen liegt; sonst fällt „Zu meinem Standort“ auf die Übersicht zurück. */
export function isInDithmarschen(loc: LatLng): boolean {
  return loc.lat >= 53.7 && loc.lat <= 54.6 && loc.lng >= 8.2 && loc.lng <= 9.7;
}

function inBounds(f: EventFeature, b: Bounds): boolean {
  const [lng, lat] = f.geometry.coordinates;
  return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
}

const BERLIN_TZ = "Europe/Berlin";

/** Formatter einmal je Modul, weil der Bau teuer ist. */
function once<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

const berlinDateFmt = once(
  () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: BERLIN_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    })
);
const berlinOffsetFmt = once(
  () => new Intl.DateTimeFormat("en-US", { timeZone: BERLIN_TZ, timeZoneName: "longOffset" })
);
const eventDateFmt = once(
  () =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: BERLIN_TZ,
      weekday: "short",
      day: "2-digit",
      month: "short",
    })
);
const eventTimeFmt = once(
  () => new Intl.DateTimeFormat("de-DE", { timeZone: BERLIN_TZ, hour: "2-digit", minute: "2-digit" })
);

/** Berlin-lokales Datum (Jahr/Monat/Tag) eines UTC-ISO-Strings. */
function berlinParts(utc: string): { y: number; m: number; d: number; dow: number } {
  const date = new Date(utc);
  const parts = berlinDateFmt().formatToParts(date);
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

/** Beginn des Berliner Kalendertags von `d` in UTC-ms, mit dem Offset des Zeitpunkts. */
function startOfBerlinDay(d: Date): number {
  const p = berlinParts(d.toISOString());
  // Kandidat: der Kalendertag um 00:00, zunächst als UTC gelesen.
  const asUtc = Date.UTC(p.y, p.m - 1, p.d);
  // longOffset statt toLocaleString-Reparse, das in der Gerätezeitzone liefe.
  const tzName = berlinOffsetFmt()
    .formatToParts(new Date(asUtc))
    .find((part) => part.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(tzName ?? "");
  const offsetMs = m
    ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600_000 + Number(m[3]) * 60_000)
    : 0;
  // Wanduhr-Mitternacht liegt um den Offset VOR der gleich benannten UTC-Zeit.
  return asUtc - offsetMs;
}

/** Beginn des Berliner Kalendertags `YYYY-MM-DD` in UTC-ms. */
function berlinDayStart(tag: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tag);
  if (!m) return null;
  const mittags = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return startOfBerlinDay(mittags);
}

/** Ob der Termin im gewählten Zeitraum liegt; verkehrte Spannen werden gedreht, eine fehlende Grenze filtert nicht. */
function matchesRange(startUtc: string, von?: string, bis?: string): boolean {
  // Ein einzelnes Datum meint genau diesen Tag.
  const vonTag = von ?? bis;
  const bisTag = bis ?? von;
  if (!vonTag || !bisTag) return true;
  const a = berlinDayStart(vonTag);
  const b = berlinDayStart(bisTag);
  if (a === null || b === null) return true;
  const start = Math.min(a, b);
  const ende = Math.max(a, b) + 86400_000; // Ende = Beginn des Folgetags
  const t = new Date(startUtc).getTime();
  return t >= start && t < ende;
}

function matchesDate(
  startUtc: string,
  filter: DateFilter,
  now: Date,
  rangeFrom?: string,
  rangeTo?: string
): boolean {
  if (filter === "all") return true;
  if (filter === "range") return matchesRange(startUtc, rangeFrom, rangeTo);
  const ev = berlinParts(startUtc);
  const today = berlinParts(now.toISOString());

  if (filter === "today") return sameDay(ev, today);

  if (filter === "weekend") {
    // Genau ein Wochenende, das laufende oder das nächste.
    if (ev.dow !== 6 && ev.dow !== 0) return false;
    // Tage bis zum Samstag dieses Wochenendes (heute, falls Sa/So).
    const daysToSat = today.dow === 0 ? -1 : (6 - today.dow) % 7;
    const satMs = startOfBerlinDay(now) + daysToSat * 86400_000;
    const sunEndMs = satMs + 2 * 86400_000; // Ende Sonntag = Beginn Montag
    const start = new Date(startUtc).getTime();
    return start >= satMs && start < sunEndMs;
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
      if (!matchesDate(f.properties.startUtc, filters.date, now, filters.rangeFrom, filters.rangeTo))
        return false;
    }
    if (!matchesCategory(f, filters.category)) return false;
    if (filters.kirchspiel && f.properties.kirchspiel !== filters.kirchspiel) return false;
    // Mehrfach zugeordnete Events zählen zu jeder ihrer Gemeinden.
    if (filters.parish && !eventParishes(f.properties).includes(filters.parish)) return false;
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
  const dateFmt = eventDateFmt();
  const timeFmt = eventTimeFmt();
  const datePart = dateFmt.format(start);
  if (allDay) return `${datePart} · ganztägig`;
  const startTime = timeFmt.format(start);
  if (showEnd && endUtc) {
    const end = new Date(endUtc);
    // Über Jahr, Monat und Tag, nur der Monatstag hielt 21.08. → 21.09. für eintägig.
    const sameDayEnd = sameDay(berlinParts(startUtc), berlinParts(endUtc));
    if (sameDayEnd) return `${datePart} · ${startTime}–${timeFmt.format(end)} Uhr`;
  }
  return `${datePart} · ${startTime} Uhr`;
}
