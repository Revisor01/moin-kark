import { describe, expect, it } from "vitest";
import { hasHighlightTag, toFeature } from "../src/geojson.js";
import type { CdEvent } from "../src/churchdesk.js";

/** Minimal-Event, in dem einzelne Felder gezielt überschrieben werden. */
function cdEvent(over: Partial<CdEvent> = {}): CdEvent {
  return {
    id: 1,
    title: "Gottesdienst",
    startDate: "2026-06-15T08:00:00Z",
    endDate: "2026-06-15T09:00:00Z",
    ...over,
  };
}

const BUESUM = { lat: 54.129605, lng: 8.861245 };

describe("toFeature — Koordinaten", () => {
  it("nimmt die ChurchDesk-Koordinate, wenn sie echt ist", () => {
    const f = toFeature(
      cdEvent({ locationObj: { latitude: 54.2, longitude: 9.1 } }),
      2725
    );
    // GeoJSON-Reihenfolge ist [lng, lat] — die App liest genau das.
    expect(f.geometry.coordinates).toEqual([9.1, 54.2]);
    expect(f.properties.coordSource).toBe("event");
  });

  it("lehnt 0/0 ab und nutzt den Gemeinde-Fallback", () => {
    // Regression: ChurchDesk liefert 0/0 (Golf von Guinea) für nicht geokodierte
    // Orte. Ungeprüft übernommen lagen diese Events mitten im Atlantik.
    const f = toFeature(
      cdEvent({
        locationObj: { latitude: 0, longitude: 0 },
        parishes: [{ id: 1, title: "Büsum" }],
      }),
      2729
    );
    expect(f.geometry.coordinates).toEqual([BUESUM.lng, BUESUM.lat]);
    expect(f.properties.coordSource).toBe("fallback");
  });

  it("nimmt eine echte Koordinate auch dann, wenn nur ein Wert 0 ist", () => {
    // Nur das Paar 0/0 ist der Nullpunkt — ein einzelner 0-Wert wäre eine
    // gültige Position (Nullmeridian) und darf nicht mit verworfen werden.
    const f = toFeature(cdEvent({ locationObj: { latitude: 54.2, longitude: 0 } }), 2725);
    expect(f.geometry.coordinates).toEqual([0, 54.2]);
    expect(f.properties.coordSource).toBe("event");
  });

  it("fällt ohne jede Ortsangabe auf die Gemeinde zurück", () => {
    const f = toFeature(cdEvent({ parishes: [{ id: 1, title: "Meldorf" }] }), 2619);
    expect(f.geometry.coordinates).toEqual([9.074945, 54.090562]);
    expect(f.properties.coordSource).toBe("fallback");
  });

  it("korrigiert bekannt falsch geokodierte Orte vor der ChurchDesk-Angabe", () => {
    // Kirche und Pastorat Wesselburen teilen sich in ChurchDesk eine Adresse.
    const f = toFeature(
      cdEvent({
        locationName: "Wesselburen | St. Bartholomäus",
        locationObj: { latitude: 54.2126, longitude: 8.9231 },
      }),
      2729
    );
    expect(f.geometry.coordinates).toEqual([8.9225438, 54.2120945]);
    expect(f.properties.coordSource).toBe("fix");
  });

  it("ordnet über den Titel zu, wenn Ort und Koordinate fehlen", () => {
    const f = toFeature(cdEvent({ title: "Pilgern in Büsum – Treffpunkt Kirche" }), 2729);
    expect(f.geometry.coordinates).toEqual([8.861221, 54.1296131]);
    expect(f.properties.coordSource).toBe("fix");
  });

  it("lässt eine gepflegte Ortsangabe der Titel-Zuordnung vorgehen", () => {
    // „Pilgern in Büsum" hat eine Titel-Zuordnung, aber der gepflegte Ort gewinnt.
    const f = toFeature(
      cdEvent({
        title: "Pilgern in Büsum",
        locationObj: { latitude: 54.15, longitude: 8.9 },
      }),
      2729
    );
    expect(f.geometry.coordinates).toEqual([8.9, 54.15]);
    expect(f.properties.coordSource).toBe("event");
  });

  it("lässt bestimmte Titel auch eine gepflegte Koordinate überstimmen", () => {
    // Auf dem Gelände der Familienlagune tragen alle Termine dieselbe Adresse,
    // finden aber an verschiedenen Stellen statt.
    const f = toFeature(
      cdEvent({
        title: "Willkommen in der Kirchenkiste!",
        locationName: "Familienlagune Perlebucht",
        locationObj: { latitude: 54.14, longitude: 8.85 },
      }),
      2729
    );
    expect(f.geometry.coordinates).toEqual([8.8382318, 54.1334736]);
    expect(f.properties.coordSource).toBe("fix");
  });
});

describe("toFeature — Eigenschaften", () => {
  it("übernimmt die Felder, die die App liest", () => {
    const f = toFeature(
      cdEvent({
        id: 4711,
        title: "Konzert",
        summary: "Kurz",
        description: "<p>Lang</p>",
        allDay: true,
        price: "5 €",
        contributor: "Kantorei",
        categories: [{ id: 7, title: "Konzert", color: 3 }],
        parishes: [{ id: 1, title: "Büsum" }],
        locationName: "St. Clemens",
        locationObj: {
          latitude: 54.13,
          longitude: 8.86,
          address: "Kirchenstr. 1",
          city: "Büsum",
          zipcode: "25761",
        },
      }),
      2729
    );
    const p = f.properties;
    expect(f.type).toBe("Feature");
    expect(f.geometry.type).toBe("Point");
    expect(p.id).toBe(4711);
    expect(p.title).toBe("Konzert");
    expect(p.startUtc).toBe("2026-06-15T08:00:00Z");
    expect(p.endUtc).toBe("2026-06-15T09:00:00Z");
    expect(p.allDay).toBe(true);
    expect(p.summary).toBe("Kurz");
    expect(p.descriptionHtml).toBe("<p>Lang</p>");
    expect(p.price).toBe("5 €");
    expect(p.contributor).toBe("Kantorei");
    expect(p.categories).toEqual([{ id: 7, title: "Konzert", color: 3 }]);
    expect(p.parish).toBe("Büsum");
    expect(p.kirchspiel).toBe("West");
    expect(p.orgId).toBe(2729);
    expect(p.orgName).toBe("Kirchspiel West");
    expect(p.locationName).toBe("St. Clemens");
    expect(p.address).toBe("Kirchenstr. 1");
    expect(p.city).toBe("Büsum");
    expect(p.zipcode).toBe("25761");
  });

  it("zeigt die Endzeit an, solange ChurchDesk sie nicht ausdrücklich abwählt", () => {
    expect(toFeature(cdEvent({}), 2725).properties.showEndtime).toBe(true);
    expect(toFeature(cdEvent({ showEndtime: true }), 2725).properties.showEndtime).toBe(true);
    expect(toFeature(cdEvent({ showEndtime: false }), 2725).properties.showEndtime).toBe(false);
  });

  it("setzt parishes nur bei Mehrfachzuordnung", () => {
    // Ein Kirchspiel-weiter Termin gehört allen Gemeinden — der Gemeindefilter
    // in der App muss ihn über jede davon finden.
    const mehrere = toFeature(
      cdEvent({
        parishes: [
          { id: 1, title: "Hennstedt" },
          { id: 2, title: "Lunden" },
        ],
      }),
      2725
    );
    expect(mehrere.properties.parish).toBe("Hennstedt");
    expect(mehrere.properties.parishes).toEqual(["Hennstedt", "Lunden"]);

    const eine = toFeature(cdEvent({ parishes: [{ id: 1, title: "Hennstedt" }] }), 2725);
    expect(eine.properties.parish).toBe("Hennstedt");
    expect(eine.properties.parishes).toBeUndefined();
  });

  it("wählt aus dem Bild-Objekt die 16:9-Variante", () => {
    const f = toFeature(
      cdEvent({
        image: {
          span1: "https://example.org/klein.jpg",
          "span4_16-9": "https://example.org/gross.jpg",
          title: "Chor",
          copyright: "Gemeinde",
        },
      }),
      2725
    );
    expect(f.properties.image).toEqual({
      url: "https://example.org/gross.jpg",
      title: "Chor",
      copyright: "Gemeinde",
    });
  });

  it("liefert ohne Bild und ohne brauchbare URL kein Bild", () => {
    expect(toFeature(cdEvent({}), 2725).properties.image).toBeUndefined();
    expect(toFeature(cdEvent({ image: null }), 2725).properties.image).toBeUndefined();
    expect(
      toFeature(cdEvent({ image: { span1: "/relativ/ohne/host.jpg" } }), 2725).properties.image
    ).toBeUndefined();
  });

  it("lässt leere Texte weg, statt leere Strings zu liefern", () => {
    const p = toFeature(
      cdEvent({ summary: "", description: "", price: "", contributor: "" }),
      2725
    ).properties;
    expect(p.summary).toBeUndefined();
    expect(p.descriptionHtml).toBeUndefined();
    expect(p.price).toBeUndefined();
    expect(p.contributor).toBeUndefined();
  });
});

describe("hasHighlightTag", () => {
  it("erkennt das Tag in der Zusammenfassung", () => {
    expect(hasHighlightTag("KAT: Highlight", undefined)).toBe(true);
  });

  it("erkennt das Tag in einer Komma-Liste", () => {
    expect(hasHighlightTag(undefined, "KAT: Blog, Highlight, Newsletter")).toBe(true);
  });

  it("erkennt das Tag auch in HTML", () => {
    expect(hasHighlightTag(undefined, "<p>Text</p><p>KAT: Highlight</p>")).toBe(true);
    expect(hasHighlightTag(undefined, "<p>KAT:&nbsp;Highlight</p>")).toBe(true);
  });

  it("ist unabhängig von Groß- und Kleinschreibung", () => {
    expect(hasHighlightTag("kat: highlight", undefined)).toBe(true);
    expect(hasHighlightTag("KAT: HIGHLIGHT", undefined)).toBe(true);
  });

  it("erkennt kein Highlight, wenn nur andere Tags gesetzt sind", () => {
    expect(hasHighlightTag("KAT: Blog, Newsletter", undefined)).toBe(false);
  });

  it("erkennt kein Highlight in normalem Fließtext", () => {
    expect(hasHighlightTag(undefined, "Das Highlight des Jahres!")).toBe(false);
    expect(hasHighlightTag(undefined, "Siehe KAT: Blog — das Highlight kommt später")).toBe(false);
  });

  it("erkennt kein Highlight ohne Text", () => {
    expect(hasHighlightTag(undefined, undefined)).toBe(false);
    expect(hasHighlightTag("", "")).toBe(false);
  });
});
