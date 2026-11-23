import { describe, expect, it } from "vitest";
import type { EventFeature } from "@moinkark/shared";
import { applyFilters, DEFAULT_FILTERS, matchesQuery, searchKey } from "../lib/filters";

// Mittwoch, 25. November 2026, 10:00 Berliner Zeit.
const NOW = new Date("2026-11-25T09:00:00.000Z");

function feature(id: number, startUtc: string, over: Partial<EventFeature["properties"]> = {}, lng = 8.86): EventFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, 54.13] },
    properties: {
      id,
      title: "Gottesdienst",
      startUtc,
      endUtc: new Date(new Date(startUtc).getTime() + 3600_000).toISOString(),
      allDay: false,
      showEndtime: true,
      categories: [{ id: 1, title: "Gottesdienst", color: 1 }],
      parish: "Büsum",
      kirchspiel: "West",
      orgId: 2729,
      orgName: "Kirchspiel West",
      coordSource: "event",
      ...over,
    },
  };
}

const krippenspiel = feature(1, "2026-12-24T14:00:00.000Z", {
  title: "Krippenspiel (Kopie)",
  titleShort: "Krippenspiel",
  locationName: "St. Clemens",
});
const posaunen = feature(2, "2026-11-26T18:00:00.000Z", {
  title: "Probe",
  contributor: "Posaunenchor",
  categories: [{ id: 2, title: "Kirchenmusik", color: 6 }],
  parish: "KG Heide",
  parishLabel: "Heide",
  kirchspiel: "Heide und Umgebung",
});
const yoga = feature(3, "2026-11-25T17:00:00.000Z", { title: "Sela-Yoga", parish: "Süderhastedt", kirchspiel: "Mitte-Süd" }, 9.2);

const ids = (fs: EventFeature[]) => fs.map((f) => f.properties.id);

describe("searchKey", () => {
  it("vergleicht ohne Groß-/Kleinschreibung, Akzente und ß", () => {
    expect(searchKey("  Süderhastedt  STRAßE ")).toBe("suderhastedt strasse");
  });
});

describe("matchesQuery", () => {
  it("findet in Titel, Kurztitel, Ort, Gemeinde, Kategorie und Mitwirkenden", () => {
    expect(matchesQuery(krippenspiel, "krippen")).toBe(true);
    expect(matchesQuery(krippenspiel, "clemens")).toBe(true);
    expect(matchesQuery(posaunen, "posaunenchor")).toBe(true);
    expect(matchesQuery(posaunen, "kirchenmusik")).toBe(true);
    expect(matchesQuery(posaunen, "heide")).toBe(true);
    expect(matchesQuery(yoga, "suderhastedt")).toBe(true);
  });

  it("verlangt jedes Wort", () => {
    expect(matchesQuery(krippenspiel, "krippenspiel büsum")).toBe(true);
    expect(matchesQuery(krippenspiel, "krippenspiel heide")).toBe(false);
  });

  it("lässt bei leerer Suche alles durch", () => {
    expect(matchesQuery(yoga, "")).toBe(true);
    expect(matchesQuery(yoga, "   ")).toBe(true);
    expect(matchesQuery(yoga, undefined)).toBe(true);
  });
});

describe("applyFilters mit Suche", () => {
  const all = [krippenspiel, posaunen, yoga];

  it("findet auch Termine nach „Diese Woche“", () => {
    expect(ids(applyFilters(all, DEFAULT_FILTERS, { now: NOW }))).toEqual([2, 3]);
    expect(ids(applyFilters(all, { ...DEFAULT_FILTERS, query: "Krippenspiel" }, { now: NOW }))).toEqual([1]);
  });

  it("sucht über den Kartenausschnitt hinaus", () => {
    const nurBuesum = { west: 8.8, east: 8.9, south: 54.1, north: 54.2 };
    expect(ids(applyFilters(all, { ...DEFAULT_FILTERS, date: "all" }, { now: NOW, bounds: nurBuesum }))).toEqual([1, 2]);
    expect(ids(applyFilters(all, { ...DEFAULT_FILTERS, query: "yoga" }, { now: NOW, bounds: nurBuesum }))).toEqual([3]);
  });

  it("kombiniert die Suche mit Kirchspiel und Kategorie", () => {
    expect(ids(applyFilters(all, { ...DEFAULT_FILTERS, query: "probe", kirchspiel: "West" }, { now: NOW }))).toEqual([]);
    expect(
      ids(applyFilters(all, { ...DEFAULT_FILTERS, query: "probe", kirchspiel: "Heide und Umgebung" }, { now: NOW }))
    ).toEqual([2]);
  });

  it("lässt Vergangenes auch bei Suche weg", () => {
    const vorbei = feature(4, "2026-11-20T10:00:00.000Z", { title: "Krippenspiel-Probe" });
    expect(ids(applyFilters([vorbei, krippenspiel], { ...DEFAULT_FILTERS, query: "krippenspiel" }, { now: NOW }))).toEqual([1]);
  });
});

describe("Suchfeld im Filter", () => {
  it("steht im Filterblatt und der Knopf nennt die Suche", async () => {
    const { readFileSync } = await import("node:fs");
    const sheet = readFileSync(new URL("../components/FilterSheet.tsx", import.meta.url), "utf8");
    const bar = readFileSync(new URL("../components/FilterBar.tsx", import.meta.url), "utf8");
    expect(sheet).toContain('accessibilityLabel="Termine durchsuchen"');
    expect(sheet).toContain("Suchen und filtern</Text>");
    expect(bar).toContain('"Suchen und filtern"');
  });
});
