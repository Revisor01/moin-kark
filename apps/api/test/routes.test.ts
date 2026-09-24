import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EventFeature, EventFeatureCollection } from "@moinkark/shared";

// Die Routen sollen ohne Netz und ohne ChurchDesk-Tokens antworten: Die
// Aggregation wird ersetzt, alles darüber (Cache, Fenster, Serialisierung) läuft echt.
const buildFeatureCollection = vi.fn<(from: Date, to: Date) => Promise<EventFeatureCollection>>();

vi.mock("../src/aggregate.js", async (orig) => ({
  ...(await orig<typeof import("../src/aggregate.js")>()),
  buildFeatureCollection: (from: Date, to: Date) => buildFeatureCollection(from, to),
}));

// Lang genug für die Mindestlänge — ein kurzes Token schaltet /admin ab (s. unten).
const ADMIN_TOKEN = "geheim-fuer-den-test-und-lang-genug";
process.env.ADMIN_TOKEN = ADMIN_TOKEN;
const ADMIN = { Authorization: `Bearer ${ADMIN_TOKEN}` };

// Die Overrides-Datei liegt in einem Temp-Verzeichnis, nie im Projekt.
const DATA_DIR = mkdtempSync(join(tmpdir(), "moinkark-routes-"));
const OVERRIDES_FILE = join(DATA_DIR, "location-overrides.json");
process.env.DATA_DIR = DATA_DIR;
afterAll(() => {
  chmodSync(DATA_DIR, 0o755);
  rmSync(DATA_DIR, { recursive: true, force: true });
});
// chmod hält root nicht auf — dort ist der Schreibfehler nicht nachstellbar.
const isRoot = process.getuid?.() === 0;

const { fmtDate } = await import("../src/churchdesk.js");

// Jeder Test bekommt eine frische API-Instanz. Der Cache lebt im Modul, und
// ein neuer Tages-Schlüssel liefert seit dem Mitternachts-Rückfall den
// vorherigen Stand statt eines leeren Caches — mit einer geteilten Instanz
// erbte jeder Test die Daten seines Vorgängers.
let app: Awaited<typeof import("../src/index.js")>["app"];

async function frischeApp(): Promise<void> {
  vi.resetModules();
  ({ app } = await import("../src/index.js"));
}

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
      orgsFailedIds: [],
      orgsConfigured: 14,
      orgsMissing: 0,
      windowFrom: "2026-06-15",
      windowTo: "2026-08-14",
      ...meta,
    },
  };
}

const TESTZEIT = "2026-06-15T06:00:00Z";

/** Rückt die Testuhr vor — der Cache-Schlüssel entsteht aus dem Berliner Kalendertag. */
function tageVor(tage: number): void {
  vi.setSystemTime(new Date(Date.now() + tage * 86400_000));
}

/**
 * Kennung eines Datenstands — jeweils aus einer frischen Instanz, damit kein
 * Cache-Rückfall dazwischenliegt und wirklich dieser Stand gehasht wird.
 */
async function kennung(fc: EventFeatureCollection): Promise<string> {
  await frischeApp();
  buildFeatureCollection.mockResolvedValue(fc);
  const res = await app.request("/version.json");
  expect(res.status).toBe(200);
  return ((await res.json()) as { version: string }).version;
}

beforeEach(async () => {
  buildFeatureCollection.mockReset();
  vi.setSystemTime(new Date(TESTZEIT));
  chmodSync(DATA_DIR, 0o755);
  for (const f of [OVERRIDES_FILE, `${OVERRIDES_FILE}.bak`, `${OVERRIDES_FILE}.tmp`])
    if (existsSync(f)) rmSync(f);
  await frischeApp();
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

  it("antwortet mit 500 und festem Text, wenn gar keine Daten geladen werden können", async () => {
    // Die interne Meldung verriet u. a. das Schema der Token-Variablen —
    // die gehört ins Log, nicht zu jedem Aufrufer.
    buildFeatureCollection.mockRejectedValue(
      new Error("[orgs] Keine ChurchDesk-Tokens konfiguriert. Setze CD_TOKEN_<orgId> in der Umgebung (.env).")
    );
    const res = await app.request("/events.geojson");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Datenstand nicht verfügbar." });
  });

  it("liefert eine leere Feature-Liste als Array, nicht als Objekt", async () => {
    // Die Apps auf den Geräten rufen .filter()/.map() auf features.
    buildFeatureCollection.mockResolvedValue(collection([]));
    const body = (await (await app.request("/events.geojson")).json()) as EventFeatureCollection;
    expect(body.features).toEqual([]);
  });

  it("liefert nach Mitternacht den Vortagesstand, wenn ChurchDesk gerade ausfällt", async () => {
    // Der Cache-Schlüssel wechselt mit dem Kalendertag. Der Stand von gestern
    // Abend liegt aber noch da — ein 500 leerte auf allen Geräten die Karte.
    buildFeatureCollection.mockResolvedValue(collection([feature({ id: 7, title: "Abendsegen" })]));
    expect((await app.request("/events.geojson")).status).toBe(200);

    tageVor(1);
    buildFeatureCollection.mockRejectedValue(new Error("ChurchDesk weg"));
    const res = await app.request("/events.geojson");
    expect(res.status).toBe(200);
    const body = (await res.json()) as EventFeatureCollection;
    expect(body.features.map((f) => f.properties.id)).toEqual([7]);
    // Der neue Tag wurde trotzdem im Hintergrund angefragt.
    await vi.waitFor(() => expect(buildFeatureCollection).toHaveBeenCalledTimes(2));
  });

  it("fragt ChurchDesk immer genau 60 Kalendertage ab — auch über die Zeitumstellung", async () => {
    // 2. Oktober 2026, 00:30 Berlin (Sommerzeit). Ein Millisekunden-Offset von
    // 60 × 24 h landete am 30. November 23:30 Berlin (Winterzeit) — 59 Tage.
    vi.setSystemTime(new Date("2026-10-01T22:30:00Z"));
    buildFeatureCollection.mockResolvedValue(collection([feature()]));
    await app.request("/events.geojson");

    expect(buildFeatureCollection).toHaveBeenCalledTimes(1);
    const [from, to] = buildFeatureCollection.mock.calls[0];
    expect(fmtDate(from)).toBe("2026-10-02");
    expect(fmtDate(to)).toBe("2026-12-01");
  });
});

describe("Bedingte Anfragen und Zwischenspeichern", () => {
  // Zwischen zwei Refreshes ist der Feed byte-identisch. Ohne Kennung im Header
  // serialisierte und komprimierte der Server ihn trotzdem für jede Anfrage neu.
  it.each(["/events.geojson", "/categories.json", "/version.json"])(
    "%s trägt ETag und Cache-Control",
    async (pfad) => {
      buildFeatureCollection.mockResolvedValue(collection([feature()]));
      const res = await app.request(pfad);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("public, max-age=60");
      expect(res.headers.get("etag")).toMatch(/^W\/"[0-9a-f]{16}"$/);
    }
  );

  it("antwortet mit 304 ohne Inhalt, wenn der Client den Stand schon hat", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature()]));
    const erste = await app.request("/events.geojson");
    const etag = erste.headers.get("etag")!;

    const res = await app.request("/events.geojson", { headers: { "If-None-Match": etag } });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
    expect(res.headers.get("etag")).toBe(etag);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("nimmt auch die komprimierte (schwache) Kennung und Listen an", async () => {
    // Nach gzip meldet der Server die Kennung als W/"…" — genau die schickt der
    // Client zurück, oft zusammen mit älteren.
    buildFeatureCollection.mockResolvedValue(collection([feature()]));
    const etag = (await app.request("/version.json")).headers.get("etag")!;
    const stark = etag.replace(/^W\//, "");
    const res = await app.request("/version.json", {
      headers: { "If-None-Match": `"veraltet", ${stark}` },
    });
    expect(res.status).toBe(304);
  });

  it("liefert den vollen Feed, sobald sich der Stand geändert hat", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature({ title: "Andacht" })]));
    const etag = (await app.request("/events.geojson")).headers.get("etag")!;

    // Nächster Tag, neuer Stand — die alte Kennung passt nicht mehr.
    tageVor(1);
    buildFeatureCollection.mockResolvedValue(collection([feature({ title: "Andacht (fällt aus)" })]));
    await vi.waitFor(async () => {
      const res = await app.request("/events.geojson", { headers: { "If-None-Match": etag } });
      expect(res.status).toBe(200);
      expect(res.headers.get("etag")).not.toBe(etag);
    });
  });

  it("gibt bei einer Kennung eines anderen Stands 200 mit Inhalt", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature()]));
    const res = await app.request("/events.geojson", {
      headers: { "If-None-Match": 'W/"0000000000000000"' },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as EventFeatureCollection).features).toHaveLength(1);
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

  it("antwortet mit 500 und festem Text, wenn gar keine Daten geladen werden können", async () => {
    buildFeatureCollection.mockRejectedValue(new Error("ChurchDesk weg"));
    const res = await app.request("/categories.json");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Datenstand nicht verfügbar." });
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
    expect(await kennung(collection([b, a]))).toBe(await kennung(collection([a, b])));
  });

  it("ändert die Kennung, wenn sich ein Titel ändert", async () => {
    const erste = await kennung(collection([feature({ title: "Andacht" })]));
    const zweite = await kennung(collection([feature({ title: "Andacht (fällt aus)" })]));
    expect(zweite).not.toBe(erste);
  });

  it("ändert die Kennung, wenn ein Highlight gesetzt wird", async () => {
    const erste = await kennung(collection([feature()]));
    const zweite = await kennung(collection([feature({ highlight: true })]));
    expect(zweite).not.toBe(erste);
  });

  // Alles, was die App anzeigt oder wonach sie filtert, muss die Kennung
  // ändern — sonst bleibt eine Korrektur auf den Geräten unsichtbar.
  it.each<[string, Partial<EventFeature["properties"]>]>([
    ["allDay", { allDay: true }],
    ["showEndtime", { showEndtime: false }],
    ["contributor", { contributor: "Pastorin Petersen" }],
    ["city", { city: "Büsum" }],
    ["zipcode", { zipcode: "25761" }],
    ["parishes", { parishes: ["Büsum", "Urlauberseelsorge"] }],
  ])("ändert die Kennung, wenn sich %s ändert", async (_feld, aenderung) => {
    const erste = await kennung(collection([feature()]));
    const zweite = await kennung(collection([feature(aenderung)]));
    expect(zweite).not.toBe(erste);
  });

  it("antwortet mit 500 und festem Text, wenn gar keine Daten geladen werden können", async () => {
    buildFeatureCollection.mockRejectedValue(new Error("ChurchDesk weg"));
    const res = await app.request("/version.json");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Datenstand nicht verfügbar." });
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

  it("meldet degraded, wenn für eine Organisation kein Token gesetzt ist", async () => {
    // Beim Redeploy ging eine Token-Zeile verloren: Die Gemeinde wird gar nicht
    // erst abgefragt, zählt also weder als ok noch als ausgefallen — und der
    // Zustand blieb „ok", obwohl ihre Termine dauerhaft fehlen.
    buildFeatureCollection.mockResolvedValue(
      collection([feature()], { orgsOk: 13, orgsFailed: 0, orgsConfigured: 13, orgsMissing: 1 })
    );
    await app.request("/events.geojson");

    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "degraded",
      orgsOk: 13,
      orgsFailed: 0,
      orgsConfigured: 13,
      orgsMissing: 1,
    });
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
    const res = await app.request("/admin/api/locations", { headers: ADMIN });
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

  // Ist die Overrides-Datei lesbar, ist Speichern erlaubt — das Feld sagt das
  // ausdrücklich, damit die Oberfläche den Sperr-Banner verbergen kann. Ohne
  // dieses Feld bliebe der Banner im Sperrfall unsichtbar (der Sperrzustand
  // selbst ist in locations.test.ts geprüft).
  it("meldet im Normalfall keinen Ladefehler der Korrekturen", async () => {
    const res = await app.request("/admin/api/locations", { headers: ADMIN });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { loadError: string | null };
    expect(body.loadError).toBeNull();
  });

  it("schaltet /admin ab, wenn das Token zu kurz ist", async () => {
    // Ein einstelliges Token wurde bisher genauso angenommen wie ein langes —
    // die Sicherheit hing allein daran, dass niemand raten würde.
    process.env.ADMIN_TOKEN = "kurz";
    try {
      await frischeApp();
      const res = await app.request("/admin/api/locations", {
        headers: { Authorization: "Bearer kurz" },
      });
      expect(res.status).toBe(503);
    } finally {
      process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    }
  });

  it("nimmt ein Token mit genau der Mindestlänge an", async () => {
    process.env.ADMIN_TOKEN = "x".repeat(24);
    try {
      await frischeApp();
      const res = await app.request("/admin/api/locations", {
        headers: { Authorization: `Bearer ${"x".repeat(24)}` },
      });
      expect(res.status).toBe(200);
    } finally {
      process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    }
  });

  it("sperrt eine Adresse nach zehn Fehlversuchen für eine Minute", async () => {
    const versuch = (token: string) =>
      app.request("/admin/api/locations", {
        headers: { Authorization: `Bearer ${token}`, "X-Real-IP": "203.0.113.7" },
      });
    for (let i = 0; i < 10; i++) expect((await versuch(`falsch-${i}`)).status).toBe(401);

    // Ab jetzt zählt nicht mehr, ob das Token stimmt — auch das richtige wartet.
    const gesperrt = await versuch("falsch-10");
    expect(gesperrt.status).toBe(429);
    expect(await gesperrt.json()).toEqual({
      error: "Zu viele Fehlversuche — bitte eine Minute warten.",
    });
    expect((await versuch(ADMIN_TOKEN)).status).toBe(429);

    // Eine andere Adresse ist nicht betroffen.
    const andere = await app.request("/admin/api/locations", {
      headers: { ...ADMIN, "X-Real-IP": "203.0.113.8" },
    });
    expect(andere.status).toBe(200);

    // Nach Ablauf der Minute geht es wieder.
    vi.setSystemTime(Date.now() + 61_000);
    expect((await versuch(ADMIN_TOKEN)).status).toBe(200);
  });
});

describe("PUT /admin/api/locations", () => {
  const put = (body: unknown) =>
    app.request("/admin/api/locations", {
      method: "PUT",
      headers: { ...ADMIN, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const LEER = { locations: {}, titles: [], categories: [], highlights: [] };

  it("speichert einen gültigen Stand und gibt ihn normalisiert zurück", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature()]));
    const res = await put({ ...LEER, categories: ["Externe  Probe"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, overrides: { ...LEER, categories: ["externe probe"] } });
    expect(existsSync(OVERRIDES_FILE)).toBe(true);
  });

  it("weist ungültige Eingaben mit 400 und dem Grund ab", async () => {
    const res = await put({ ...LEER, locations: { Probe: { lat: 0, lng: 0 } } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Ungültige Koordinate für „Probe\"." });
  });

  it("meldet 409, wenn Speichern wegen unlesbarer Ablage gesperrt ist", async () => {
    writeFileSync(OVERRIDES_FILE, "{ kaputt", "utf8");
    await frischeApp();
    const res = await put(LEER);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/beim Start nicht gelesen werden/);
  });

  it.skipIf(isRoot)("meldet einen Schreibfehler als 500 ohne Dateipfad", async () => {
    // Volume schreibgeschützt: Das ist kein Eingabefehler des Admins (400),
    // und der Pfad der Ablage geht niemanden außerhalb des Logs etwas an.
    chmodSync(DATA_DIR, 0o500);
    const res = await put(LEER);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Korrekturen konnten nicht gespeichert werden." });
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

describe("GET /event/:id (Link-Vorschau beim Teilen)", () => {
  it("liefert OpenGraph-Angaben des Termins", async () => {
    buildFeatureCollection.mockResolvedValue(
      collection([feature({ id: 42, title: "Orgelkonzert", locationName: "St. Bartholomäus" })])
    );
    const res = await app.request("/event/42");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);

    const html = await res.text();
    expect(html).toContain('property="og:title" content="Orgelkonzert"');
    // Ort und Zeit gehoeren in die Beschreibung, sonst steht in WhatsApp nur ein Titel.
    expect(html).toMatch(/property="og:description" content="[^"]*St. Bartholomäus[^"]*"/);
    expect(html).toContain('property="og:type" content="article"');
  });

  it("verweist auf die Karte mit dem Termin", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature({ id: 42 })]));
    const html = await (await app.request("/event/42")).text();
    expect(html).toContain("https://karte.moin-kark.de/?event=42");
  });

  it("schickt Menschen per Weiterleitung auf die Karte", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature({ id: 42 })]));
    const html = await (await app.request("/event/42")).text();
    // Crawler lesen die Metadaten, Menschen sollen nicht auf der Zwischenseite landen.
    expect(html).toContain('http-equiv="refresh"');
  });

  it("nimmt das Bild des Termins, wenn eines da ist", async () => {
    buildFeatureCollection.mockResolvedValue(
      collection([feature({ id: 42, image: { url: "https://bilder.example/kirche.jpg" } as any })])
    );
    const html = await (await app.request("/event/42")).text();
    expect(html).toContain('property="og:image" content="https://bilder.example/kirche.jpg"');
  });

  it("faellt ohne Bild auf das Standardmotiv zurueck", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature({ id: 42, image: undefined })]));
    const html = await (await app.request("/event/42")).text();
    expect(html).toContain('property="og:image" content="https://moin-kark.de/og.jpg"');
  });

  it("antwortet 404 fuer einen unbekannten Termin", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature({ id: 42 })]));
    const res = await app.request("/event/999");
    expect(res.status).toBe(404);
  });

  it("antwortet 404 bei nicht-numerischer ID", async () => {
    buildFeatureCollection.mockResolvedValue(collection([feature({ id: 42 })]));
    expect((await app.request("/event/abc")).status).toBe(404);
  });

  it("maskiert HTML in Titel und Ort", async () => {
    // Ein Titel aus ChurchDesk landet ungeprueft im Attribut — ohne Maskierung
    // liesse sich das Dokument von aussen veraendern.
    buildFeatureCollection.mockResolvedValue(
      collection([feature({ id: 42, title: 'Konzert" onload="boese()', locationName: "<b>Kirche</b>" })])
    );
    const html = await (await app.request("/event/42")).text();
    expect(html).not.toContain('onload="boese()');
    expect(html).not.toContain("<b>Kirche</b>");
    expect(html).toContain("&quot;");
  });
});

describe("Zuordnungsdateien fuer App-Links", () => {
  it("liefert apple-app-site-association als JSON", async () => {
    const res = await app.request("/.well-known/apple-app-site-association");
    expect(res.status).toBe(200);
    // Apple verlangt application/json; ohne den Typ greift der Universal Link nicht.
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = (await res.json()) as any;
    expect(body.applinks.details[0].appIDs).toEqual(["J459G9CJT5.de.godsapp.kkdithkarte"]);
  });

  it("beschraenkt die Zuordnung auf /event/*", async () => {
    const body = (await (await app.request("/.well-known/apple-app-site-association")).json()) as any;
    expect(body.applinks.details[0].components[0]["/"]).toBe("/event/*");
  });

  it("liefert assetlinks.json mit Paketname und Fingerprint", async () => {
    const res = await app.request("/.well-known/assetlinks.json");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any[];
    expect(body[0].target.package_name).toBe("de.godsapp.moinkark");
    // Zwei Schluessel: Play signiert im Store neu, lokale Testbuilds tragen den
    // Upload-Schluessel. Fehlt einer, oeffnet Android den Link im Browser.
    expect(body[0].target.sha256_cert_fingerprints).toHaveLength(2);
    for (const fp of body[0].target.sha256_cert_fingerprints) {
      expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    }
    expect(body[0].relation).toEqual(["delegate_permission/common.handle_all_urls"]);
  });
});
