import { describe, expect, it } from "vitest";
import { normalizeKey } from "../src/types";
import { kanonischeKategorie } from "../src/kategorien";

// An normalizeKey hängen Tabellen und /admin-Korrekturen, deshalb eng festgenagelt.
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
    // Die Tabellen sind mit Umlauten geschrieben.
    expect(normalizeKey("Wöhrden")).toBe("wöhrden");
    expect(normalizeKey("Süderhastedt")).toBe("süderhastedt");
    expect(normalizeKey("STRAßE")).toBe("straße");
  });

  it("lässt Bindestriche und Satzzeichen unangetastet", () => {
    // Bindestrich und Punkt gehören zu Tabellenschlüsseln.
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

describe("kanonischeKategorie", () => {
  // Jede Gemeinde benennt Kategorien selbst, bis zu achtmal anders.
  it("fasst die acht Kinder- und Jugend-Schreibweisen zusammen", () => {
    for (const s of [
      "Kinder/Jugendliche",
      "Kinder / Jugendliche",
      "Kinder u. Jugend",
      "Kinder- und Jugendarbeit",
      "Kinder und Jugendliche",
      "Kinder & Familien",
      "Kinder- und Jugendwerk",
      "Jugendarbeit",
    ])
      expect(kanonischeKategorie(s)).toBe("Kinder & Jugend");
  });

  it("fasst Proben und Kirchenmusik zusammen", () => {
    for (const s of ["Musikalische Proben", "Musikalische Probe", "Chor", "Chorproben", "Kirchenmusik"])
      expect(kanonischeKategorie(s)).toBe("Kirchenmusik");
  });

  it("fasst Singular und Plural zusammen", () => {
    expect(kanonischeKategorie("Konzert")).toBe("Konzerte");
    expect(kanonischeKategorie("Konzerte")).toBe("Konzerte");
    expect(kanonischeKategorie("Treffen")).toBe("Treffpunkt");
    expect(kanonischeKategorie("Treffpunkte")).toBe("Treffpunkt");
  });

  it("fasst gegenderte und ungegenderte Schreibweise zusammen", () => {
    expect(kanonischeKategorie("Senior:innen")).toBe("Senioren");
    expect(kanonischeKategorie("Senioren")).toBe("Senioren");
  });

  it("laesst Gottesdienst und Andacht getrennt", () => {
    // Verschiedene Formate — bewusst nicht zusammengelegt.
    expect(kanonischeKategorie("Gottesdienst")).toBe("Gottesdienst");
    expect(kanonischeKategorie("Andacht")).toBe("Andacht");
    // Die Mischform gehoert zum Gottesdienst.
    expect(kanonischeKategorie("Gottesdienst - Andacht")).toBe("Gottesdienst");
  });

  it("laesst unbekannte Kategorien unveraendert", () => {
    expect(kanonischeKategorie("Tierra Sagrada")).toBe("Tierra Sagrada");
    expect(kanonischeKategorie("KostNix")).toBe("KostNix");
  });

  it("ist unempfindlich gegen Gross-/Kleinschreibung und Leerraum", () => {
    expect(kanonischeKategorie("  KINDER / JUGENDLICHE  ")).toBe("Kinder & Jugend");
  });
});
