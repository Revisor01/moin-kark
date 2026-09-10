import { describe, expect, it } from "vitest";
import { normalizeKey } from "../src/types";

// An normalizeKey hängen die statischen Tabellen (Kirchspiele, Koordinaten) UND
// die über /admin gepflegten Laufzeit-Korrekturen. Driftet sie, greifen gepflegte
// Korrekturen still nicht mehr — deshalb ist sie hier eng festgenagelt.
describe("normalizeKey", () => {
  it("macht klein und schneidet Rand-Leerzeichen weg", () => {
    expect(normalizeKey("  BÜSUM  ")).toBe("büsum");
  });

  it("zieht Leerzeichenfolgen zu einem zusammen", () => {
    expect(normalizeKey("St.   Annen  und   Hemme")).toBe("st. annen und hemme");
  });

  it("behandelt Tabs und Zeilenumbrüche wie Leerzeichen", () => {
    expect(normalizeKey("Kirche\tWesseln\nNord")).toBe("kirche wesseln nord");
  });

  it("lässt Umlaute und ß stehen, statt sie zu ersetzen", () => {
    // Die Tabellen sind mit Umlauten geschrieben ("büsum", "wöhrden") — würde
    // hier transliteriert, träfe kein einziger Eintrag mehr.
    expect(normalizeKey("Wöhrden")).toBe("wöhrden");
    expect(normalizeKey("Süderhastedt")).toBe("süderhastedt");
    expect(normalizeKey("STRAßE")).toBe("straße");
  });

  it("lässt Bindestriche und Satzzeichen unangetastet", () => {
    // "lohe-rickelshof" und "st. annen" sind Tabellen-Schlüssel: ein entfernter
    // Bindestrich oder Punkt würde sie unauffindbar machen.
    expect(normalizeKey("Lohe-Rickelshof")).toBe("lohe-rickelshof");
    expect(normalizeKey("St. Martins-Kirche")).toBe("st. martins-kirche");
  });

  it("liefert für reine Leerzeichen den leeren String", () => {
    // locations.ts verlässt sich darauf: leerer Schlüssel ⇒ Eingabe abweisen.
    expect(normalizeKey("   ")).toBe("");
  });

  it("ist idempotent", () => {
    const once = normalizeKey("  Urlauberseelsorge   Büsum ");
    expect(normalizeKey(once)).toBe(once);
  });
});
