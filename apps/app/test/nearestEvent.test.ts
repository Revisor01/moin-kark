import { describe, expect, it } from "vitest";
import type { EventFeature } from "@moinkark/shared";
import { pickNearestAtSpot } from "../lib/nearestEvent";

const WESSELBUREN: [number, number] = [8.9225438, 54.2120945];
const BUESUM: [number, number] = [8.861221, 54.1296131];

function feature(id: number, coords: [number, number], startUtc: string): EventFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: coords },
    properties: {
      id,
      title: `Termin ${id}`,
      startUtc,
      endUtc: startUtc,
      allDay: false,
      showEndtime: true,
      categories: [],
      kirchspiel: "West",
      orgId: 2729,
      orgName: "Kirchspiel West",
      coordSource: "event",
    },
  };
}

// Drei Termine übereinander in Wesselburen, einer in Büsum. Die Reihenfolge im
// Array ist absichtlich NICHT chronologisch — genau das ist der Fall, in dem
// `features[0]` daneben griffe.
const FEATURES = [
  feature(3, WESSELBUREN, "2026-09-20T10:00:00Z"),
  feature(1, WESSELBUREN, "2026-09-15T08:00:00Z"),
  feature(2, WESSELBUREN, "2026-09-17T18:00:00Z"),
  feature(9, BUESUM, "2026-09-14T09:00:00Z"),
];

describe("pickNearestAtSpot", () => {
  it("wählt unter deckungsgleichen Pins den zeitlich nächsten Termin", () => {
    expect(pickNearestAtSpot(FEATURES, WESSELBUREN, [3])).toBe(1);
  });

  it("lässt die gemeldeten Treffer außen vor, sobald an der Koordinate Events liegen", () => {
    // Die Karte meldet nur den obersten Pin (3) — trotzdem gewinnt 1, weil er
    // an derselben Stelle früher stattfindet.
    expect(pickNearestAtSpot(FEATURES, WESSELBUREN, [3, 2])).toBe(1);
  });

  it("fällt auf die gemeldeten IDs zurück, wenn die Koordinate nicht exakt trifft", () => {
    // Kachelgenau gerundete Koordinate: kein Feature liegt exakt dort.
    const rounded: [number, number] = [8.9225, 54.2121];
    expect(pickNearestAtSpot(FEATURES, rounded, [3, 2])).toBe(2);
  });

  it("nimmt bei einem einzelnen gemeldeten Treffer genau diesen", () => {
    expect(pickNearestAtSpot(FEATURES, [8.9225, 54.2121], [3])).toBe(3);
  });

  it("liefert die erste gemeldete ID, wenn sie zu keinem Feature mehr gehört", () => {
    // Die Karte kann noch einen Pin aus einem älteren Datenstand melden.
    expect(pickNearestAtSpot(FEATURES, [8.9225, 54.2121], [4711])).toBe(4711);
  });

  it("liefert null statt NaN, wenn weder Koordinate noch IDs etwas hergeben", () => {
    // Das war der ungeschützte Web-Pfad: Number(undefined) → NaN → Sheet ohne Inhalt.
    expect(pickNearestAtSpot(FEATURES, [8.9225, 54.2121], [Number(undefined)])).toBeNull();
    expect(pickNearestAtSpot(FEATURES, undefined, [])).toBeNull();
    expect(pickNearestAtSpot([], WESSELBUREN, [])).toBeNull();
  });

  it("ignoriert nicht-numerische IDs unter den gemeldeten Treffern", () => {
    expect(pickNearestAtSpot(FEATURES, [8.9225, 54.2121], [NaN, 9])).toBe(9);
  });

  it("wählt an einem Pin mit nur einem Termin diesen", () => {
    expect(pickNearestAtSpot(FEATURES, BUESUM, [9])).toBe(9);
  });
});
