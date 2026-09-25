import { describe, expect, it } from "vitest";
import { applyFilters, DEFAULT_FILTERS } from "../lib/filters";
import type { EventFeature } from "@moinkark/shared";

// Eigener Zeitraum im Filter: von-bis, beides als Kalendertag in Berliner Zeit.
// Die bestehenden Stufen (heute, Woche, Wochenende) rechnen ebenfalls in
// Berliner Zeit — der eigene Zeitraum muss das genauso tun, sonst fehlt am
// Rand ein Tag, je nach Sommer- oder Winterzeit.

function feature(startUtc: string, id = 1): EventFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [9.05, 54.2] },
    properties: {
      id,
      title: "Termin",
      startUtc,
      endUtc: new Date(new Date(startUtc).getTime() + 3600_000).toISOString(),
      allDay: false,
      showEndtime: true,
      categories: [],
      kirchspiel: "West",
      orgId: 2729,
      orgName: "Kirchspiel West",
      coordSource: "event",
    },
  } as EventFeature;
}

/** Filtert mit eigenem Zeitraum und gibt die gefundenen IDs zurück. */
function imZeitraum(events: EventFeature[], von: string, bis: string, now: Date): number[] {
  const res = applyFilters(events, { ...DEFAULT_FILTERS, date: "range", rangeFrom: von, rangeTo: bis }, { now });
  return res.map((f) => f.properties.id);
}

describe("Eigener Zeitraum", () => {
  // Mittwoch, 1. Oktober 2026, 10:00 Berliner Zeit (Sommerzeit, UTC+2)
  const now = new Date("2026-10-01T08:00:00.000Z");

  it("nimmt Termine innerhalb der Spanne", () => {
    const events = [
      feature("2026-10-05T16:00:00.000Z", 1), // Mo 5.10., 18:00 Berlin
      feature("2026-10-08T10:00:00.000Z", 2), // Do 8.10., 12:00 Berlin
    ];
    expect(imZeitraum(events, "2026-10-05", "2026-10-10", now)).toEqual([1, 2]);
  });

  it("schliesst den ersten Tag ab 00:00 ein", () => {
    // 5.10. um 00:30 Berlin = 4.10. 22:30 UTC — der Termin gehoert zum 5.,
    // obwohl sein UTC-Datum der 4. ist. Genau hier ginge eine UTC-Rechnung
    // schief.
    const e = [feature("2026-10-04T22:30:00.000Z", 1)];
    expect(imZeitraum(e, "2026-10-05", "2026-10-10", now)).toEqual([1]);
  });

  it("schliesst den letzten Tag bis 23:59 ein", () => {
    // 10.10. um 23:30 Berlin = 21:30 UTC.
    const e = [feature("2026-10-10T21:30:00.000Z", 1)];
    expect(imZeitraum(e, "2026-10-05", "2026-10-10", now)).toEqual([1]);
  });

  it("laesst den Tag vor der Spanne weg", () => {
    // 4.10. um 23:00 Berlin = 21:00 UTC — noch der 4., also draussen.
    const e = [feature("2026-10-04T21:00:00.000Z", 1)];
    expect(imZeitraum(e, "2026-10-05", "2026-10-10", now)).toEqual([]);
  });

  it("laesst den Tag nach der Spanne weg", () => {
    // 11.10. um 00:30 Berlin = 10.10. 22:30 UTC — schon der 11., also draussen.
    const e = [feature("2026-10-10T22:30:00.000Z", 1)];
    expect(imZeitraum(e, "2026-10-05", "2026-10-10", now)).toEqual([]);
  });

  it("kommt mit einem einzelnen Tag klar", () => {
    const e = [
      feature("2026-10-05T10:00:00.000Z", 1), // im Tag
      feature("2026-10-06T10:00:00.000Z", 2), // Tag danach
    ];
    expect(imZeitraum(e, "2026-10-05", "2026-10-05", now)).toEqual([1]);
  });

  it("rechnet auch in der Winterzeit richtig", () => {
    // Nach der Umstellung (25.10.2026) gilt UTC+1: 2.11. um 00:30 Berlin
    // = 1.11. 23:30 UTC.
    const e = [feature("2026-11-01T23:30:00.000Z", 1)];
    const jetzt = new Date("2026-10-30T09:00:00.000Z");
    expect(imZeitraum(e, "2026-11-02", "2026-11-05", jetzt)).toEqual([1]);
  });

  it("faellt ohne gesetzte Grenzen auf alles zurueck", () => {
    // Halbfertige Eingabe darf die Liste nicht leeren.
    const e = [feature("2026-12-24T16:00:00.000Z", 1)];
    const res = applyFilters(e, { ...DEFAULT_FILTERS, date: "range" }, { now });
    expect(res.map((f) => f.properties.id)).toEqual([1]);
  });

  it("dreht eine verkehrt herum eingegebene Spanne um", () => {
    // Wer erst das Ende tippt, soll nicht vor einer leeren Liste sitzen.
    const e = [feature("2026-10-07T10:00:00.000Z", 1)];
    expect(imZeitraum(e, "2026-10-10", "2026-10-05", now)).toEqual([1]);
  });
});
