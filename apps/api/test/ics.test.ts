import { describe, expect, it } from "vitest";
import type { EventFeature } from "@moinkark/shared";
import { buildCalendar, calendarName, escapeText, foldLine, veventLines } from "../src/ics.js";

function feature(over: Partial<EventFeature["properties"]> = {}): EventFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [8.861245, 54.129605] },
    properties: {
      id: 7,
      title: "Gottesdienst",
      startUtc: "2026-12-24T15:00:00Z",
      endUtc: "2026-12-24T16:00:00Z",
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

const STAMP = new Date("2026-12-01T10:20:30.456Z");

/** Zeilen entfalten wie ein Kalenderprogramm. */
const unfold = (s: string) => s.replace(/\r\n /g, "");

describe("escapeText", () => {
  it("maskiert Backslash, Semikolon, Komma und Zeilenumbrüche", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
});

describe("foldLine", () => {
  it("lässt kurze Zeilen stehen", () => {
    expect(foldLine("SUMMARY:Gottesdienst")).toBe("SUMMARY:Gottesdienst");
  });

  it("faltet bei 75 Oktetten, Folgezeilen mit Leerzeichen", () => {
    const line = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.map((p) => Buffer.byteLength(p))).toEqual([75, 75, 64]);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(unfold(folded)).toBe(line);
  });

  it("zerteilt keine Umlaute", () => {
    const line = `SUMMARY:${"ü".repeat(80)}`;
    const parts = foldLine(line).split("\r\n");
    for (const p of parts) {
      expect(Buffer.byteLength(p)).toBeLessThanOrEqual(75);
      expect(p).not.toContain("�");
    }
    expect(unfold(parts.join("\r\n"))).toBe(line);
  });
});

describe("veventLines", () => {
  it("rechnet Winterzeit in Berliner Ortszeit um", () => {
    const lines = veventLines(feature(), STAMP);
    expect(lines).toContain("DTSTART;TZID=Europe/Berlin:20261224T160000");
    expect(lines).toContain("DTEND;TZID=Europe/Berlin:20261224T170000");
    expect(lines).toContain("DTSTAMP:20261201T102030Z");
    expect(lines).toContain("UID:7@moin-kark.de");
  });

  it("schreibt ganztägige Termine als Datum mit exklusivem Ende", () => {
    // ChurchDesk: 24.12. 00:00 bis 23:59:59 Berliner Zeit.
    const lines = veventLines(
      feature({ allDay: true, startUtc: "2026-12-23T23:00:00Z", endUtc: "2026-12-24T22:59:59Z" }),
      STAMP
    );
    expect(lines).toContain("DTSTART;VALUE=DATE:20261224");
    expect(lines).toContain("DTEND;VALUE=DATE:20261225");
  });

  it("setzt bei fehlendem oder zu frühem Ende eine Stunde an", () => {
    const lines = veventLines(feature({ endUtc: "2026-12-24T15:00:00Z" }), STAMP);
    expect(lines).toContain("DTEND;TZID=Europe/Berlin:20261224T170000");
  });

  it("nimmt den Kurztitel, den vollen Titel in die Beschreibung, Ort ohne Dopplung", () => {
    const lines = veventLines(
      feature({
        title: "Konzert (Orgel; Trompete)",
        titleShort: "Konzert",
        locationName: "St. Clemens",
        address: "Kirchenstraße 1",
        zipcode: "25761",
        city: "Büsum",
        parish: "KG Heide",
        summary: "Mit Chor, Gemeinde",
      }),
      STAMP
    );
    const text = unfold(lines.join("\r\n"));
    expect(text).toContain("SUMMARY:Konzert\r\n");
    expect(text).toContain("LOCATION:St. Clemens\\, Kirchenstraße 1\\, 25761 Büsum\r\n");
    expect(text).toContain(
      "DESCRIPTION:Konzert (Orgel\\; Trompete)\\n\\nMit Chor\\, Gemeinde\\n\\nKirchengemeinde Heide\\n\\nhttps://moin-kark.de/event/7\r\n"
    );
    expect(text).toContain("URL:https://moin-kark.de/event/7\r\n");
    expect(text).toContain("GEO:54.129605;8.861245\r\n");
    expect(text).toContain("CATEGORIES:Gottesdienst\r\n");
  });

  it("macht aus HTML-Beschreibungen Text ohne Redaktions-Marker", () => {
    const lines = veventLines(
      feature({ descriptionHtml: "<p>Mit Kerzen &amp; Liedern</p><p>KAT: Highlight</p>" }),
      STAMP
    );
    expect(unfold(lines.join("\r\n"))).toContain("DESCRIPTION:Mit Kerzen & Liedern\\n\\nKirchengemeinde Büsum");
  });
});

describe("buildCalendar", () => {
  it("hat Kopf, Zeitzone, CRLF überall und keine Zeile über 75 Oktette", () => {
    const ics = buildCalendar([feature({ summary: "x".repeat(300) })], { name: "Moin Kark", stamp: STAMP });
    expect(ics.split("\r\n").slice(0, 7)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Moin Kark//Termine Kirchenkreis Dithmarschen//DE",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Moin Kark",
      "X-WR-TIMEZONE:Europe/Berlin",
    ]);
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin\r\n");
    expect(ics).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\n");
    expect(ics).toContain("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\n");
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toContain("REFRESH-INTERVAL");
  });

  it("gibt bei gleichem Datenstand dieselbe Datei", () => {
    const a = buildCalendar([feature()], { name: "x", stamp: STAMP });
    const b = buildCalendar([feature()], { name: "x", stamp: STAMP });
    expect(a).toBe(b);
  });
});

describe("calendarName", () => {
  it("nennt die Filter", () => {
    expect(calendarName({})).toBe("Moin Kark: alle Termine");
    expect(calendarName({ parish: "Heide", category: "Kirchenmusik" })).toBe("Moin Kark: Heide, Kirchenmusik");
    expect(calendarName({ kirchspiel: "West" })).toBe("Moin Kark: Kirchspiel West");
  });
});
