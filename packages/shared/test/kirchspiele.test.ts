import { describe, expect, it } from "vitest";
import { eventParishes, orgName, parishesLabel, resolveKirchspiel } from "../src/kirchspiele";

describe("resolveKirchspiel", () => {
  it("ordnet über den Gemeindenamen zu, auch wenn die orgId etwas anderes sagt", () => {
    // Die Gemeinde ist die feinere Quelle: Ein Termin der Org „Kirchspiel West"
    // (2729), der an Meldorf hängt, gehört nach Mitte-Süd.
    expect(resolveKirchspiel("Meldorf", 2729)).toBe("Mitte-Süd");
  });

  it("erkennt den Gemeindenamen unabhängig von Schreibweise und Leerzeichen", () => {
    expect(resolveKirchspiel("  BÜSUM ", 2596)).toBe("West");
    expect(resolveKirchspiel("hennstedt", 2596)).toBe("Eider");
  });

  it("erkennt Umlaut-Varianten aus ChurchDesk", () => {
    // Manche Orgs pflegen „Buesum"/„Woehrden" ohne Umlaut.
    expect(resolveKirchspiel("Buesum", 2596)).toBe("West");
    expect(resolveKirchspiel("Woehrden", 2596)).toBe("Heide und Umgebung");
  });

  it("greift bei Namenszusätzen über den Teilstring", () => {
    expect(resolveKirchspiel("Heide St.-Jürgen", 2596)).toBe("Heide und Umgebung");
  });

  it("fällt auf die orgId zurück, wenn die Gemeinde unbekannt ist", () => {
    expect(resolveKirchspiel("Irgendwo", 2725)).toBe("Eider");
    expect(resolveKirchspiel(undefined, 2729)).toBe("West");
    expect(resolveKirchspiel(undefined, 6572)).toBe("Heide und Umgebung");
  });

  it("landet ohne jeden Treffer beim Kirchenkreis", () => {
    expect(resolveKirchspiel("Irgendwo", 9999)).toBe("Kirchenkreis Dithmarschen");
    expect(resolveKirchspiel(undefined, 9999)).toBe("Kirchenkreis Dithmarschen");
  });

  it("ordnet Helgoland dem Kirchspiel West zu", () => {
    expect(resolveKirchspiel("Helgoland", 2729)).toBe("West");
  });
});

describe("eventParishes", () => {
  it("liefert alle Gemeinden bei Mehrfachzuordnung", () => {
    // Kirchspiel-weite Termine (Sommerkirche) hängen an allen Gemeinden — der
    // Gemeindefilter muss den Termin über jede davon finden.
    expect(eventParishes({ parish: "Hennstedt", parishes: ["Hennstedt", "Lunden", "Hemme"] })).toEqual([
      "Hennstedt",
      "Lunden",
      "Hemme",
    ]);
  });

  it("fällt auf die einzelne Gemeinde zurück", () => {
    expect(eventParishes({ parish: "Büsum" })).toEqual(["Büsum"]);
  });

  it("liefert eine leere Liste, wenn gar keine Gemeinde gesetzt ist", () => {
    expect(eventParishes({})).toEqual([]);
    expect(eventParishes({ parishes: [] })).toEqual([]);
  });
});

describe("parishesLabel", () => {
  it("schreibt bei Mehrfachzuordnung alle Namen mit Kirchspiel aus", () => {
    expect(
      parishesLabel({ parishes: ["Hennstedt", "Weddingstedt", "Hemme"], kirchspiel: "Eider" })
    ).toBe("Kirchspiel Eider: Hennstedt, Weddingstedt und Hemme");
  });

  it("nennt bei einer einzelnen Gemeinde nur deren Namen", () => {
    expect(parishesLabel({ parish: "Büsum", kirchspiel: "West" })).toBe("Büsum");
  });

  it("liefert ohne Gemeinde undefined", () => {
    expect(parishesLabel({ kirchspiel: "West" })).toBeUndefined();
  });
});

describe("orgName", () => {
  it("liefert den Anzeigenamen der Organisation", () => {
    expect(orgName(2725)).toBe("Kirchspiel Eider");
    expect(orgName(2619)).toBe("Meldorf");
  });

  it("nennt unbekannte Organisationen bei ihrer Nummer", () => {
    expect(orgName(9999)).toBe("Org 9999");
  });
});
