import { describe, expect, it } from "vitest";
import {
  coordFixFor,
  coordFixForTitle,
  coordOverrideForTitle,
  DITHMARSCHEN_CENTER,
  fallbackCoords,
  type LatLng,
} from "../src/kirchen-coords";

/** Abstand zweier Punkte in Metern (Haversine) — für „liegt der Pin am richtigen Ort?". */
function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const BUESUM = { lat: 54.129605, lng: 8.861245 };

describe("fallbackCoords", () => {
  it("findet die Gemeinde unabhängig von Schreibweise und Leerzeichen", () => {
    expect(fallbackCoords("  MELDORF ", 2596)).toEqual({ lat: 54.090562, lng: 9.074945 });
  });

  it("hat für Helgoland einen eigenen Punkt statt des Büsumer Org-Pins", () => {
    // Sonst landet Helgoland in Büsum.
    const helgoland = fallbackCoords("Helgoland", 2729);
    expect(helgoland).toEqual({ lat: 54.178889, lng: 7.886389 });
    expect(distanceMeters(helgoland, BUESUM)).toBeGreaterThan(50_000);
  });

  it("hat für Neuenkirchen einen eigenen Punkt statt des Büsumer Org-Pins", () => {
    // Sonst landet Neuenkirchen in Büsum.
    const neuenkirchen = fallbackCoords("Neuenkirchen", 2729);
    expect(neuenkirchen).toEqual({ lat: 54.23672, lng: 8.9898787 });
    expect(distanceMeters(neuenkirchen, BUESUM)).toBeGreaterThan(9_000);
  });

  it("setzt Pahlen und Delve auf ihre Kirchen, nicht auf den alten Geest-Punkt", () => {
    const pahlen = fallbackCoords("Pahlen", 2723);
    const delve = fallbackCoords("Delve", 2723);
    expect(pahlen).toEqual({ lat: 54.2628322, lng: 9.2956512 });
    expect(delve).toEqual({ lat: 54.3033433, lng: 9.2539684 });
    expect(distanceMeters(pahlen, delve)).toBeGreaterThan(4_000);
  });

  it("setzt Lohe-Rickelshof auf die Christuskirche", () => {
    // Regression: der frühere Schätzpunkt lag ~1,6 km nördlich der Kirche.
    expect(fallbackCoords("Lohe-Rickelshof", 2722)).toEqual({
      lat: 54.1873944,
      lng: 9.0706326,
    });
  });

  it("fällt ohne Gemeinde auf die Organisation zurück", () => {
    expect(fallbackCoords(undefined, 2729)).toEqual(BUESUM);
    expect(fallbackCoords(undefined, 2720)).toEqual({ lat: 53.898038, lng: 9.141931 });
  });

  it("landet ohne jeden Treffer im Zentrum Dithmarschens", () => {
    expect(fallbackCoords(undefined, 9999)).toEqual(DITHMARSCHEN_CENTER);
    expect(fallbackCoords("Buxtehude", 9999)).toEqual(DITHMARSCHEN_CENTER);
  });

  it("liefert für jede Gemeinde einen Punkt in Dithmarschen oder auf Helgoland", () => {
    // Kein Eintrag am Nullpunkt oder anderswo in Deutschland.
    for (const parish of ["Büsum", "Marne", "Heide", "Tellingstedt", "Helgoland", "Lunden"]) {
      const c = fallbackCoords(parish, 9999);
      expect(c.lat).toBeGreaterThan(53.8);
      expect(c.lat).toBeLessThan(54.5);
      expect(c.lng).toBeGreaterThan(7.8);
      expect(c.lng).toBeLessThan(9.5);
    }
  });
});

describe("coordFixFor", () => {
  it("korrigiert die Wesselburener Kirche weg vom Pastorat", () => {
    // Kirche und Pastorat unter derselben Adresse dürfen nicht aufeinander liegen.
    const kirche = coordFixFor("Wesselburen | St. Bartholomäus");
    expect(kirche).toEqual({ lat: 54.2120945, lng: 8.9225438 });
    // Deutlich abseits des Gemeindepunkts (Gemeindehaus).
    expect(distanceMeters(kirche!, fallbackCoords("Wesselburen", 2729))).toBeGreaterThan(150);
  });

  it("trennt die drei Tellingstedter Kirchen voneinander", () => {
    const wrohm = coordFixFor("Friedenskirche Wrohm")!;
    const tellingstedt = coordFixFor("St. Martins-Kirche")!;
    const albersdorf = coordFixFor("St. Remigius-Kirche")!;
    expect(distanceMeters(wrohm, tellingstedt)).toBeGreaterThan(6_000);
    expect(distanceMeters(albersdorf, tellingstedt)).toBeGreaterThan(7_000);
  });

  it("findet den Ort unabhängig von Schreibweise und Leerzeichen", () => {
    expect(coordFixFor("  RATHAUSPLATZ   MELDORF ")).toEqual({
      lat: 54.0893979,
      lng: 9.0738847,
    });
  });

  it("liefert für unbekannte und leere Orte undefined", () => {
    // Dann gilt die ChurchDesk-Angabe.
    expect(coordFixFor("Irgendein Gemeindehaus")).toBeUndefined();
    expect(coordFixFor(undefined)).toBeUndefined();
    expect(coordFixFor("")).toBeUndefined();
  });

  it("trifft keine Einträge aus der Prototypkette", () => {
    // „Constructor“ traf Object.prototype.constructor.
    expect(coordFixFor("Constructor")).toBeUndefined();
    expect(coordFixFor("__proto__")).toBeUndefined();
    expect(coordFixFor("hasOwnProperty")).toBeUndefined();
  });
});

describe("fallbackCoords mit Namen aus der Prototypkette", () => {
  it("fällt auf die Organisation zurück statt auf Object.prototype", () => {
    expect(fallbackCoords("constructor", 2729)).toEqual(BUESUM);
    expect(fallbackCoords("__proto__", 2729)).toEqual(BUESUM);
  });
});

describe("coordFixForTitle", () => {
  it("greift als Präfix, auch bei Varianten des Titels", () => {
    const expected = { lat: 54.1334736, lng: 8.8382318 };
    expect(coordFixForTitle("Willkommen in der Kirchenkiste")).toEqual(expected);
    expect(coordFixForTitle("Willkommen in der Kirchenkiste!")).toEqual(expected);
    expect(coordFixForTitle("WILLKOMMEN IN DER KIRCHENKISTE – jeden Dienstag")).toEqual(expected);
  });

  it("trennt den Abendsegen von der Kirchenkiste", () => {
    // Beide auf dem Gelände der Familienlagune, aber an verschiedenen Stellen.
    const kiste = coordFixForTitle("Willkommen in der Kirchenkiste")!;
    const abendsegen = coordFixForTitle("Abendsegen bei Sonnenuntergang")!;
    expect(distanceMeters(kiste, abendsegen)).toBeGreaterThan(300);
  });

  it("greift nicht, wenn der Titel den Präfix nur enthält statt damit zu beginnen", () => {
    expect(coordFixForTitle("Heute: Pilgern in Büsum")).toBeUndefined();
  });

  it("liefert für unbekannte und leere Titel undefined", () => {
    expect(coordFixForTitle("Gottesdienst")).toBeUndefined();
    expect(coordFixForTitle(undefined)).toBeUndefined();
  });
});

describe("coordOverrideForTitle", () => {
  it("überstimmt eine gepflegte Ortsangabe nur für die vorgesehenen Reihen", () => {
    expect(coordOverrideForTitle("Willkommen in der Kirchenkiste!")).toEqual({
      lat: 54.1334736,
      lng: 8.8382318,
    });
    expect(coordOverrideForTitle("Abendsegen bei Sonnenuntergang")).toEqual({
      lat: 54.13673,
      lng: 8.8351529,
    });
  });

  it("überstimmt nichts bei Titeln, die nur einen normalen Titel-Fix haben", () => {
    // Ohne Override überstimmt eine Titel-Zuordnung keine gepflegte Koordinate.
    expect(coordFixForTitle("Pilgern in Büsum")).toBeDefined();
    expect(coordOverrideForTitle("Pilgern in Büsum")).toBeUndefined();
  });

  it("liefert für unbekannte und leere Titel undefined", () => {
    expect(coordOverrideForTitle("Gottesdienst")).toBeUndefined();
    expect(coordOverrideForTitle(undefined)).toBeUndefined();
  });
});
