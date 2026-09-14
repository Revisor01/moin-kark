import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Zählt, wie oft Intl.DateTimeFormat gebaut wird — BEVOR das Modul geladen
// wird, damit auch die erste (lazy) Instanz mitgezählt wird.
const Original = Intl.DateTimeFormat;
let constructed = 0;

beforeAll(() => {
  (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = new Proxy(Original, {
    construct(target, args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
      constructed++;
      return new target(...args);
    },
  });
});

afterAll(() => {
  (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = Original;
});

describe("formatEventTime — Formatter werden wiederverwendet", () => {
  const start = "2026-09-20T16:00:00.000Z";
  const end = "2026-09-20T17:30:00.000Z";

  it("baut beim ersten Aufruf genau drei Formatter und danach keinen mehr", async () => {
    const { formatEventTime } = await import("../lib/filters");
    constructed = 0;
    expect(formatEventTime(start, end, false, true)).toBe("So., 20. Sept. · 18:00–19:30 Uhr");
    // Datum, Uhrzeit, Berlin-Kalendertag (für den Gleicher-Tag-Vergleich).
    // Vorher waren es VIER neue Instanzen bei JEDEM Aufruf — je sichtbarer
    // Karte und Render.
    expect(constructed).toBe(3);

    constructed = 0;
    for (let i = 0; i < 1000; i++) formatEventTime(start, end, false, true);
    expect(constructed).toBe(0);
  });

  it("liefert weiterhin dieselben Texte für ganztägig und mehrtägig", async () => {
    const { formatEventTime } = await import("../lib/filters");
    expect(formatEventTime(start, end, true)).toBe("So., 20. Sept. · ganztägig");
    expect(formatEventTime(start, "2026-09-21T10:00:00.000Z", false, true)).toBe(
      "So., 20. Sept. · 18:00 Uhr"
    );
    expect(formatEventTime(start, end, false, false)).toBe("So., 20. Sept. · 18:00 Uhr");
  });

  it("baut auch für die Wochenend-Berechnung nur einmal einen Offset-Formatter", async () => {
    const { applyFilters, DEFAULT_FILTERS } = await import("../lib/filters");
    const feature = (startUtc: string) =>
      ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [9.0, 54.2] },
        properties: {
          id: 1,
          title: "Gottesdienst",
          startUtc,
          allDay: false,
          categories: [],
          kirchspiel: "Eider",
          parish: "Hennstedt",
        },
      }) as never;
    const now = new Date("2026-09-16T10:00:00.000Z"); // Mittwoch
    const filters = { ...DEFAULT_FILTERS, date: "weekend" as const };

    constructed = 0;
    applyFilters([feature("2026-09-19T08:00:00.000Z")], filters, { now });
    const first = constructed;
    expect(first).toBeLessThanOrEqual(2); // Berlin-Kalendertag (falls noch nicht) + Offset
    constructed = 0;
    for (let i = 0; i < 200; i++) applyFilters([feature("2026-09-19T08:00:00.000Z")], filters, { now });
    expect(constructed).toBe(0);
  });
});
