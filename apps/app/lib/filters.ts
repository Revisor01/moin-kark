// Reine, testbare Filterlogik. Wirkt clientseitig auf das gecachte GeoJSON — kein Refetch.

import type { EventFeature } from "@kkd/shared";

export type DateFilter = "all" | "today" | "week" | "weekend";

export interface Filters {
  date: DateFilter;
  /** Normalisierter Kategorie-Titel (lowercase) oder null = alle. */
  category: string | null;
}

export const DEFAULT_FILTERS: Filters = { date: "all", category: null };

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
  return start >= from - 12 * 3600_000 && start <= to; // -12h Toleranz für laufende Events heute
}

function matchesCategory(f: EventFeature, category: string | null): boolean {
  if (!category) return true;
  return f.properties.categories.some((c) => c.title.trim().toLowerCase() === category);
}

export function applyFilters(
  features: EventFeature[],
  filters: Filters,
  now: Date = new Date()
): EventFeature[] {
  return features.filter(
    (f) => matchesDate(f.properties.startUtc, filters.date, now) && matchesCategory(f, filters.category)
  );
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
