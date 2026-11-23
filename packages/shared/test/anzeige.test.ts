import { describe, expect, it } from "vitest";
import { parishLabel, titleShort } from "../src/anzeige";

describe("parishLabel", () => {
  it("nimmt Verwaltungs-Vorsätze vom Ortsnamen", () => {
    expect(parishLabel("KG Heide")).toBe("Heide");
    expect(parishLabel("KG  Nordhastedt")).toBe("Nordhastedt");
    expect(parishLabel("KG Hemmingstedt")).toBe("Hemmingstedt");
    expect(parishLabel("Kirche Wesseln")).toBe("Wesseln");
    expect(parishLabel("Ev.-Luth. Kirchengemeinde Meldorf")).toBe("Meldorf");
    expect(parishLabel("Kirchengemeinde Lunden")).toBe("Lunden");
  });

  it("lässt Namen ohne Vorsatz stehen, bereinigt nur Leerzeichen", () => {
    expect(parishLabel("Hennstedt")).toBe("Hennstedt");
    expect(parishLabel("St. Michaelisdonn")).toBe("St. Michaelisdonn");
    expect(parishLabel("Urlauberseelsorge Büsum")).toBe("Urlauberseelsorge Büsum");
    expect(parishLabel("Kirchspiel Süd")).toBe("Kirchspiel Süd");
    expect(parishLabel(" Pahlen  und Delve ")).toBe("Pahlen und Delve");
  });

  it("macht aus einem bloßen Vorsatz keinen leeren Namen", () => {
    expect(parishLabel("KG")).toBe("KG");
    expect(parishLabel("Kirche")).toBe("Kirche");
  });
});

describe("titleShort", () => {
  it("streicht Klammerzusätze und die angehängte Leitung", () => {
    expect(
      titleShort(
        "Krabbelkreis, Leitung: Annemarie Schäfer (Veranstalter: Gemeinschaft in der ev. Kirche, Mensch im Zentrum Dithmarschen, Ev.-Luth. Kirchengemeinde Meldorf)"
      )
    ).toBe("Krabbelkreis");
    expect(titleShort("Musikunterricht für Kinder (Blockflöte oder Klavier)")).toBe("Musikunterricht für Kinder");
    expect(titleShort("Sela-Yoga | Christliches Yoga für Erwachsene (Kopie)")).toBe(
      "Sela-Yoga | Christliches Yoga für Erwachsene"
    );
  });

  it("streicht Klammern auch mitten im Titel", () => {
    expect(
      titleShort("Aktion der FRIDA (0 Frauenrechte in Dithmarschen)-Netzwerks")
    ).toBe("Aktion der FRIDA-Netzwerks");
  });

  it("zieht Leerzeichen zusammen, auch vor Komma und Doppelpunkt", () => {
    expect(titleShort("Weihnachtskonzert der  „Büttpedders“")).toBe("Weihnachtskonzert der „Büttpedders“");
    expect(titleShort("Friedenslichtgottesdienst Nordhastedt : Gemeinsam")).toBe(
      "Friedenslichtgottesdienst Nordhastedt: Gemeinsam"
    );
    expect(titleShort("dann drei, dann vier ...")).toBe("dann drei, dann vier ...");
  });

  it("setzt GROSS geschriebene Abschnitte normal, einzelne Abkürzungen bleiben", () => {
    expect(titleShort("KLASSIK BEI KERZENLICHT - DAS KONZERTHIGHLIGHT in Tellingstedt")).toBe(
      "Klassik bei Kerzenlicht - Das Konzerthighlight in Tellingstedt"
    );
    expect(titleShort("Orange Days; WENDO, Selbstverteidigungskurs")).toBe("Orange Days; WENDO, Selbstverteidigungskurs");
    expect(titleShort("Übungsabend des TSV Nordhastedt")).toBe("Übungsabend des TSV Nordhastedt");
  });

  it("lässt saubere Titel unverändert", () => {
    expect(titleShort("Gottesdienst")).toBe("Gottesdienst");
    expect(titleShort("Christvesper an Heiligabend")).toBe("Christvesper an Heiligabend");
  });

  it("fällt auf den bereinigten Titel zurück, wenn nur die Klammer übrig wäre", () => {
    expect(titleShort("(Kopie)")).toBe("(Kopie)");
    expect(titleShort("(Orgel)  ")).toBe("(Orgel)");
  });

  it("bleibt bei langen Leerzeichenfolgen schnell", () => {
    const start = performance.now();
    expect(titleShort(`a${" ".repeat(50_000)}b${" ".repeat(50_000)}`)).toBe("a b");
    expect(performance.now() - start).toBeLessThan(200);
  });
});
