import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventFeature, EventFeatureCollection } from "@moinkark/shared";

// Die Routen sollen ohne Netz und ohne ChurchDesk-Tokens antworten: Die
// Aggregation wird ersetzt, alles darüber (Cache, Fenster, Serialisierung) läuft echt.
const buildFeatureCollection = vi.fn<() => Promise<EventFeatureCollection>>();

vi.mock("../src/aggregate.js", async (orig) => ({
  ...(await orig<typeof import("../src/aggregate.js")>()),
  buildFeatureCollection: () => buildFeatureCollection(),
}));

process.env.ADMIN_TOKEN = "geheim-fuer-den-test";
const { app } = await import("../src/index.js");

function feature(over: Partial<EventFeature["properties"]> = {}): EventFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [8.861245, 54.129605] },
    properties: {
      id: 1,
      title: "Gottesdienst",
      startUtc: "2026-06-15T08:00:00Z",
      endUtc: "2026-06-15T09:00:00Z",
      allDay: false,
      showEndtime: true,
      categories: [{ id: 1, title: "Gottesdienst", color: 1 }],
      parish: "Büsum",
      kirchspiel: "West",
      orgId: 2729,
      orgName: "Kirchspiel West",
      locationName: "St. Clemens",
      coordSource: "event",
      ...over,
    },
  };
}

function collection(features: EventFeature[], meta: Partial<NonNullable<EventFeatureCollection["meta"]>> = {}): EventFeatureCollection {
  const withEventCoords = features.filter((f) => f.properties.coordSource === "event").length;
  return {
    type: "FeatureCollection",
    features,
    meta: {
      generatedAt: "2026-06-15T06:00:00.000Z",
      from: "2026-06-15T00:00:00.000Z",
      to: "2026-08-14T00:00:00.000Z",
      total: features.length,
      withEventCoords,
      withFallbackCoords: features.length - withEventCoords,
      orgsOk: 14,
      orgsFailed: 0,
      ...meta,
    },
  };
}

// Der Cache-Schlüssel entsteht aus dem Berliner Kalendertag: Damit sich die Tests
// nicht gegenseitig ihren Datenstand vererben, rückt jeder um einen Tag vor. Die
// Zeit läuft dabei bewusst nur vorwärts — peekLatest() nimmt den jüngsten
// Eintrag, ein Rücksprung würde einen alten Stand zum aktuellen machen.
let testTag = Date.UTC(2026, 5, 15, 6, 0, 0);

/** Rückt die Testuhr vor — und merkt sich den Stand, damit der nächste Test dahinter beginnt. */
function tageVor(tage: number): void {
  testTag += tage * 86400_000;
  vi.setSystemTime(new Date(testTag));
}

beforeEach(() => {
  buildFeatureCollection.mockReset();
  tageVor(1);
});
afterEach(() => vi.useRealTimers());

describe("GET /events.geojson", () => {
  it("liefert gültiges GeoJSON mit den Feldern, die die App liest", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature()]));
    const res = await app.request("/events.geojson");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);

    const body = (await res.json()) as EventFeatureCollection;
    // Antwortform ist ein Vertrag gegenüber den Apps auf den Geräten.
    expect(body.type).toBe("FeatureCollection");
    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features).toHaveLength(1);

    const f = body.features[0];
    expect(f.type).toBe("Feature");
    expect(f.geometry.type).toBe("Point");
    expect(f.geometry.coordinates).toEqual([8.861245, 54.129605]);
    expect(f.properties.id).toBe(1);
    expect(f.properties.title).toBe("Gottesdienst");
    expect(f.properties.startUtc).toBe("2026-06-15T08:00:00Z");
    expect(f.properties.kirchspiel).toBe("West");
    expect(f.properties.orgName).toBe("Kirchspiel West");
    expect(f.properties.coordSource).toBe("event");
  });

  it("liefert für jedes Feature Koordinaten in gültigen Grenzen", async () => {
    buildFeatureCollection.mockResolvedValue(
      collection([
        feature({ id: 1 }),
        { ...feature({ id: 2, coordSource: "fallback" }), geometry: { type: "Point", coordinates: [9.074945, 54.090562] } },
      ])
    );
    const body = (await (await app.request("/events.geojson")).json()) as EventFeatureCollection;
    for (const f of body.features) {
      const [lng, lat] = f.geometry.coordinates;
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      // 0/0 darf nie im Feed landen — das ist der Nullpunkt im Golf von Guinea.
      expect(lng === 0 && lat === 0).toBe(false);
    }
  });

  it("antwortet mit 500, wenn gar keine Daten geladen werden können", async () => {
    buildFeatureCollection.mockRejectedValue(new Error("Alle 14 Org-Fetches fehlgeschlagen"));
    const res = await app.request("/events.geojson");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Alle 14 Org-Fetches fehlgeschlagen" });
  });

  it("liefert eine leere Feature-Liste als Array, nicht als Objekt", async () => {
    // Die Apps auf den Geräten rufen .filter()/.map() auf features.
    buildFeatureCollection.mockResolvedValue(collection([]));
    const body = (await (await app.request("/events.geojson")).json()) as EventFeatureCollection;
    expect(body.features).toEqual([]);
  });
});

describe("GET /categories.json", () => {
  it("liefert ein Array mit Titel, Farbe und Anzahl", async () => {
    buildFeatureCollection.mockResolvedValue(
      collection([
        feature({ id: 1, categories: [{ id: 1, title: "Gottesdienst", color: 1 }] }),
        feature({ id: 2, categories: [{ id: 9, title: "gottesdienst", color: 1 }] }),
        feature({ id: 3, categories: [{ id: 2, title: "Konzert", color: 4 }] }),
      ])
    );
    const res = await app.request("/categories.json");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { title: string; color: number; count: number }[];
    // Antwortform ist ein Vertrag: ein Array, kein Objekt.
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([
      { title: "Gottesdienst", color: 1, count: 2 },
      { title: "Konzert", color: 4, count: 1 },
    ]);
  });

  it("antwortet mit 500, wenn gar keine Daten geladen werden können", async () => {
    buildFeatureCollection.mockRejectedValue(new Error("ChurchDesk weg"));
    const res = await app.request("/categories.json");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "ChurchDesk weg" });
  });
});

describe("GET /version.json", () => {
  it("liefert Kennung und Anzahl", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature()]));
    const res = await app.request("/version.json");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { version: string; count: number };
    expect(body.count).toBe(1);
    expect(body.version).toMatch(/^[0-9a-f]{16}$/);
  });

  it("hält die Kennung stabil, wenn sich nur die Reihenfolge ändert", async () => {
    // Sonst lüde jedes Gerät ~700 KB, nur weil ChurchDesk anders sortiert hat.
    const a = feature({ id: 1, title: "Andacht" });
    const b = feature({ id: 2, title: "Konzert" });

    buildFeatureCollection.mockResolvedValue(collection([a, b]));
    const erste = (await (await app.request("/version.json")).json()) as { version: string };

    tageVor(1);
    buildFeatureCollection.mockResolvedValue(collection([b, a]));
    const zweite = (await (await app.request("/version.json")).json()) as { version: string };

    expect(zweite.version).toBe(erste.version);
  });

  it("ändert die Kennung, wenn sich ein Titel ändert", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature({ title: "Andacht" })]));
    const erste = (await (await app.request("/version.json")).json()) as { version: string };

    tageVor(1);
    buildFeatureCollection.mockResolvedValue(collection([feature({ title: "Andacht (fällt aus)" })]));
    const zweite = (await (await app.request("/version.json")).json()) as { version: string };

    expect(zweite.version).not.toBe(erste.version);
  });

  it("ändert die Kennung, wenn ein Highlight gesetzt wird", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature()]));
    const erste = (await (await app.request("/version.json")).json()) as { version: string };

    tageVor(1);
    buildFeatureCollection.mockResolvedValue(collection([feature({ highlight: true })]));
    const zweite = (await (await app.request("/version.json")).json()) as { version: string };

    expect(zweite.version).not.toBe(erste.version);
  });

  it("antwortet mit 500, wenn gar keine Daten geladen werden können", async () => {
    buildFeatureCollection.mockRejectedValue(new Error("ChurchDesk weg"));
    const res = await app.request("/version.json");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "ChurchDesk weg" });
  });
});

describe("GET /healthz und /status.json", () => {
  it("meldet ok mit 200, wenn alle Organisationen geantwortet haben", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature()]));
    await app.request("/events.geojson"); // Datenstand füllen

    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "ok",
      events: 1,
      orgsOk: 14,
      orgsFailed: 0,
      generatedAt: "2026-06-15T06:00:00.000Z",
      cacheAgeSeconds: 0,
    });
  });

  it("meldet degraded mit 200, wenn eine Organisation ausgefallen ist", async () => {
    // Deren Events fehlen still — das muss sichtbar sein, darf aber den
    // Container nicht als ungesund gelten lassen.
    buildFeatureCollection.mockResolvedValue(
      collection([feature()], { orgsOk: 13, orgsFailed: 1 })
    );
    await app.request("/events.geojson");

    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "degraded", orgsOk: 13, orgsFailed: 1 });
  });

  it("meldet stale mit 503, wenn der Datenstand zu alt ist", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature()]));
    await app.request("/events.geojson");

    // Über 3×TTL (Standard 20 min) hinaus altern lassen.
    vi.setSystemTime(Date.now() + 61 * 60_000);
    const res = await app.request("/healthz");
    expect(res.status).toBe(503);
    expect(((await res.json()) as { status: string }).status).toBe("stale");
  });

  it("liefert unter /status.json dieselbe Lage plus die Fallback-Orte", async () => {
    buildFeatureCollection.mockResolvedValue(
      collection([
        feature({ id: 1, coordSource: "event" }),
        feature({ id: 2, coordSource: "fallback", locationName: "Gemeindehaus", title: "Chor" }),
        feature({ id: 3, coordSource: "fallback", locationName: "Gemeindehaus", title: "Andacht" }),
        feature({ id: 4, coordSource: "fallback", locationName: undefined, parish: "Lunden", title: "Treff" }),
      ])
    );
    await app.request("/events.geojson");

    const res = await app.request("/status.json");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      events: number;
      withEventCoords: number;
      fallback: { name: string; count: number; titles: string[] }[];
    };
    expect(body).toMatchObject({ status: "ok", events: 4, withEventCoords: 1 });
    // Nach Häufigkeit sortiert, mit den Titeln zur Einordnung.
    expect(body.fallback).toEqual([
      { name: "Gemeindehaus", count: 2, titles: ["Chor", "Andacht"] },
      { name: "(kein Ortsname) — Lunden", count: 1, titles: ["Treff"] },
    ]);
  });
});

describe("GET /", () => {
  it("nennt Dienst und Zustand", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ service: "moinkark-api", status: "ok" });
  });
});

describe("Admin-Routen", () => {
  it("weist Zugriffe ohne Token ab", async () => {
    const res = await app.request("/admin/api/locations");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("weist ein falsches Token ab", async () => {
    const res = await app.request("/admin/api/locations", {
      headers: { Authorization: "Bearer falsch" },
    });
    expect(res.status).toBe(401);
  });

  it("lässt das richtige Token durch", async () => {
    const res = await app.request("/admin/api/locations", {
      headers: { Authorization: "Bearer geheim-fuer-den-test" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      static: { excludedCategories: string[] };
      overrides: { locations: object; titles: unknown[]; categories: string[]; highlights: number[] };
    };
    expect(body.static.excludedCategories).toContain("externe buchung");
    expect(body.overrides).toMatchObject({
      locations: {},
      titles: [],
      categories: [],
      highlights: [],
    });
  });

  it("weist auch die Highlight-Route ohne Token ab", async () => {
    const res = await app.request("/admin/api/highlights");
    expect(res.status).toBe(401);
  });
});

describe("CORS", () => {
  it("erlaubt eine Origin aus der Liste", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature()]));
    const res = await app.request("/events.geojson", {
      headers: { Origin: "http://localhost:8081" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");
  });

  it("gibt fremden Origins keinen Allow-Origin-Header", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature()]));
    const res = await app.request("/events.geojson", {
      headers: { Origin: "https://boese.example" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
