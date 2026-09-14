import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CdEvent } from "../src/churchdesk.js";
import type { OrgConfig } from "../src/orgs.js";
import { META_FIELDS } from "./meta-fields.js";

// Die Org-Liste und der ChurchDesk-Client werden ersetzt: Die Tests dürfen weder
// Tokens brauchen noch das Netz anfassen.
const fetchOrgEvents = vi.fn<(org: OrgConfig, from: Date, to: Date) => Promise<CdEvent[]>>();
const loadOrgs = vi.fn<() => OrgConfig[]>();
const missingOrgIds = vi.fn<() => number[]>();

vi.mock("../src/churchdesk.js", async (orig) => ({
  ...(await orig<typeof import("../src/churchdesk.js")>()),
  fetchOrgEvents: (...a: Parameters<typeof fetchOrgEvents>) => fetchOrgEvents(...a),
}));
vi.mock("../src/orgs.js", () => ({
  loadOrgs: () => loadOrgs(),
  missingOrgIds: () => missingOrgIds(),
}));

// Laufzeit-Ausschlüsse laufen echt, aber gegen ein Temp-Verzeichnis — nie ins Projekt.
const DATA_DIR = mkdtempSync(join(tmpdir(), "moinkark-aggregate-"));
process.env.DATA_DIR = DATA_DIR;
const { loadOverrides, setOverrides } = await import("../src/locations.js");
const { buildFeatureCollection, extractCategories, EXCLUDED_CATEGORIES } = await import(
  "../src/aggregate.js"
);
const { fmtDate } = await import("../src/churchdesk.js");
afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }));

function cdEvent(over: Partial<CdEvent> = {}): CdEvent {
  return {
    id: 1,
    title: "Gottesdienst",
    startDate: "2026-06-15T08:00:00Z",
    endDate: "2026-06-15T09:00:00Z",
    ...over,
  };
}

const FROM = new Date("2026-06-15T00:00:00Z");
const TO = new Date("2026-08-14T00:00:00Z");

/**
 * Bildet die gegebenen Orgs mit ihren Events ab; nicht genannte Orgs fallen aus.
 * `missing` sind Orgs, für die gar kein Token gesetzt ist (werden nie abgefragt).
 */
function withOrgs(map: Record<number, CdEvent[] | Error>, missing: number[] = []) {
  loadOrgs.mockReturnValue(
    Object.keys(map).map((id) => ({ id: Number(id), token: "test" }))
  );
  missingOrgIds.mockReturnValue(missing);
  fetchOrgEvents.mockImplementation(async (org) => {
    const v = map[org.id];
    if (v instanceof Error) throw v;
    return v;
  });
}

beforeEach(() => {
  fetchOrgEvents.mockReset();
  loadOrgs.mockReset();
  missingOrgIds.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("buildFeatureCollection", () => {
  it("baut eine FeatureCollection mit Meta-Angaben", async () => {
    withOrgs({
      2729: [cdEvent({ id: 1, locationObj: { latitude: 54.13, longitude: 8.86 } })],
      2725: [cdEvent({ id: 2, parishes: [{ id: 1, title: "Hennstedt" }] })],
    });
    const fc = await buildFeatureCollection(FROM, TO);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(2);
    expect(fc.meta).toMatchObject({
      total: 2,
      withEventCoords: 1,
      withFallbackCoords: 1,
      orgsOk: 2,
      orgsFailed: 0,
      orgsFailedIds: [],
      orgsConfigured: 2,
      orgsMissing: 0,
      from: FROM.toISOString(),
      to: TO.toISOString(),
    });
  });

  it("liefert genau die Meta-Felder, die die Doku beschreibt", async () => {
    withOrgs({ 2729: [cdEvent({ id: 1 })] });
    const fc = await buildFeatureCollection(FROM, TO);
    expect(Object.keys(fc.meta!).sort()).toEqual(META_FIELDS);
  });

  it("nennt das Abfragefenster als Berliner Kalendertage", async () => {
    // `from`/`to` sind Zeitpunkte; ChurchDesk bekommt aber Kalendertage — und
    // die entscheiden, ob ein Termin von heute früh noch dabei ist.
    withOrgs({ 2729: [cdEvent({ id: 1 })] });
    const fc = await buildFeatureCollection(FROM, TO);
    expect(fc.meta?.windowFrom).toBe(fmtDate(FROM));
    expect(fc.meta?.windowTo).toBe(fmtDate(TO));
    expect(fc.meta?.windowFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("dedupliziert dasselbe Event über mehrere Organisationen", async () => {
    // Ein Termin, den Kirchspiel und Einzelgemeinde beide führen.
    withOrgs({ 2725: [cdEvent({ id: 42 })], 2619: [cdEvent({ id: 42 })] });
    const fc = await buildFeatureCollection(FROM, TO);
    expect(fc.features).toHaveLength(1);
    expect(fc.meta?.total).toBe(1);
  });

  it("lässt bei Doppelungen die spezifischere Organisation gewinnen", async () => {
    // Einzelgemeinde (Meldorf) ist spezifischer als Kirchspiel und Dach.
    withOrgs({
      2596: [cdEvent({ id: 42 })],
      2725: [cdEvent({ id: 42 })],
      2619: [cdEvent({ id: 42 })],
    });
    const fc = await buildFeatureCollection(FROM, TO);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.orgId).toBe(2619);
    expect(fc.features[0].properties.orgName).toBe("Meldorf");
  });

  it("liefert die Events der erreichbaren Organisationen weiter, wenn eine ausfällt", async () => {
    // Ein abgelaufener Einzeltoken darf nicht den ganzen Feed kippen.
    withOrgs({
      2729: [cdEvent({ id: 1 })],
      2725: new Error("ChurchDesk 2725 HTTP 401"),
    });
    const fc = await buildFeatureCollection(FROM, TO);
    expect(fc.features).toHaveLength(1);
    expect(fc.meta?.orgsOk).toBe(1);
    expect(fc.meta?.orgsFailed).toBe(1);
  });

  it("nennt die IDs der ausgefallenen Organisationen", async () => {
    // Die App merkt sich Termine und meldet Absagen. Fehlt eine Gemeinde im
    // Feed, muss sie WISSEN, welche — sonst hält sie alle Termine dieser
    // Gemeinde für abgesagt und verschickt falsche Mitteilungen.
    withOrgs({
      2729: [cdEvent({ id: 1 })],
      2725: new Error("ChurchDesk 2725 HTTP 401"),
      2619: new Error("ChurchDesk 2619 HTTP 500"),
    });
    const fc = await buildFeatureCollection(FROM, TO);
    // In der Reihenfolge der konfigurierten Orgs (hier: aufsteigend).
    expect(fc.meta?.orgsFailedIds).toEqual([2619, 2725]);
    expect(fc.meta?.orgsFailed).toBe(2);
  });

  it("zählt Organisationen ohne Token als fehlend, nicht als erreicht", async () => {
    // Geht beim Redeploy eine Token-Zeile verloren, fehlt eine ganze Gemeinde
    // dauerhaft — das muss in den Zahlen auftauchen, nicht nur im Log.
    withOrgs({ 2729: [cdEvent({ id: 1 })], 2725: [cdEvent({ id: 2 })] }, [2596]);
    const fc = await buildFeatureCollection(FROM, TO);
    expect(fc.meta).toMatchObject({
      orgsOk: 2,
      orgsFailed: 0,
      orgsConfigured: 2,
      orgsMissing: 1,
    });
  });

  it("überspringt ein kaputtes Event, statt den ganzen Refresh zu kippen", async () => {
    // Ein Event mit `title: null` in einer Kategorie ließ die Transformation
    // werfen — und damit scheiterte der Refresh für alle 14 Gemeinden, obwohl
    // 13 davon einwandfrei geantwortet hatten.
    const kaputt = cdEvent({
      id: 2,
      categories: [{ id: 5, title: null as unknown as string, color: 1 }],
    });
    withOrgs({
      2729: [cdEvent({ id: 1 }), kaputt, cdEvent({ id: 3 })],
      2725: [cdEvent({ id: 4 })],
    });
    const fc = await buildFeatureCollection(FROM, TO);
    expect(fc.features.map((f) => f.properties.id).sort()).toEqual([1, 3, 4]);
    expect(fc.meta?.orgsOk).toBe(2);
    expect(fc.meta?.orgsFailed).toBe(0);
  });

  it("wirft beim Totalausfall, statt eine leere Sammlung zu liefern", async () => {
    // Eine leere Collection würde den Cache überschreiben und alle Geräte ihren
    // lokalen Bestand mit nichts ersetzen lassen.
    withOrgs({
      2729: new Error("ChurchDesk weg"),
      2725: new Error("ChurchDesk weg"),
    });
    await expect(buildFeatureCollection(FROM, TO)).rejects.toThrow(
      /Alle 2 Org-Fetches fehlgeschlagen/
    );
  });

  it("nimmt nicht-öffentliche Kategorien aus dem Feed", async () => {
    withOrgs({
      2729: [
        cdEvent({ id: 1, categories: [{ id: 1, title: "Gottesdienst", color: 1 }] }),
        cdEvent({ id: 2, categories: [{ id: 2, title: "Externe Buchung", color: 2 }] }),
        cdEvent({ id: 3, categories: [{ id: 3, title: "Kirchengemeinderatssitzung", color: 3 }] }),
        cdEvent({ id: 4, categories: [{ id: 4, title: "Konfirmanden", color: 4 }] }),
      ],
    });
    const fc = await buildFeatureCollection(FROM, TO);
    expect(fc.features.map((f) => f.properties.id)).toEqual([1]);
  });

  it("schließt Kategorien unabhängig von Schreibweise und Leerzeichen aus", async () => {
    withOrgs({
      2729: [cdEvent({ id: 1, categories: [{ id: 1, title: "  EXTERNE Buchung  ", color: 1 }] })],
    });
    const fc = await buildFeatureCollection(FROM, TO);
    expect(fc.features).toHaveLength(0);
  });

  it("schließt auch bei doppelten Leerzeichen im Kategorienamen aus", async () => {
    // ChurchDesk liefert solche Namen wirklich („St. Remigius-Kirche  Albersdorf").
    withOrgs({
      2729: [cdEvent({ id: 1, categories: [{ id: 1, title: "Externe  Buchung", color: 1 }] })],
    });
    const fc = await buildFeatureCollection(FROM, TO);
    expect(fc.features).toHaveLength(0);
  });

  it("wendet einen über /admin gepflegten Ausschluss auch auf Namen mit doppelten Leerzeichen an", async () => {
    // Der Admin klickt die Kategorie so an, wie sie im Feed steht (mit zwei
    // Leerzeichen); gespeichert wird sie normalisiert. Der Vergleich beim
    // Aggregieren muss dieselbe Normalisierung nutzen, sonst zeigt die
    // Oberfläche den Ausschluss als aktiv, die Termine bleiben aber im Feed.
    loadOverrides();
    setOverrides({ locations: {}, titles: [], categories: ["Probe  Kategorie"], highlights: [] });
    withOrgs({
      2729: [
        cdEvent({ id: 1, categories: [{ id: 1, title: "Probe  Kategorie", color: 1 }] }),
        cdEvent({ id: 2, categories: [{ id: 2, title: "Probe Kategorie", color: 2 }] }),
        cdEvent({ id: 3, categories: [{ id: 3, title: "Gottesdienst", color: 3 }] }),
      ],
    });
    const fc = await buildFeatureCollection(FROM, TO);
    expect(fc.features.map((f) => f.properties.id)).toEqual([3]);
  });

  it("nimmt ein Event schon dann heraus, wenn eine seiner Kategorien ausgeschlossen ist", async () => {
    withOrgs({
      2729: [
        cdEvent({
          id: 1,
          categories: [
            { id: 1, title: "Gottesdienst", color: 1 },
            { id: 2, title: "Interne Veranstaltungen", color: 2 },
          ],
        }),
      ],
    });
    const fc = await buildFeatureCollection(FROM, TO);
    expect(fc.features).toHaveLength(0);
  });

  it("hält die feste Ausschlussliste fest", async () => {
    expect([...EXCLUDED_CATEGORIES].sort()).toEqual([
      "amtshandlungen -intern-",
      "externe buchung",
      "interne veranstaltungen",
      "kirchengemeinderatssitzung",
      "konfirmanden",
    ]);
  });
});

describe("extractCategories", () => {
  const fc = (titel: string[][]) => ({
    type: "FeatureCollection" as const,
    features: titel.map((ts, i) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [9, 54] as [number, number] },
      properties: {
        id: i,
        title: "T",
        startUtc: "2026-06-15T08:00:00Z",
        endUtc: "2026-06-15T09:00:00Z",
        allDay: false,
        showEndtime: true,
        categories: ts.map((t, j) => ({ id: j, title: t, color: j })),
        kirchspiel: "West",
        orgId: 2729,
        orgName: "Kirchspiel West",
        coordSource: "event" as const,
      },
    })),
  });

  it("fasst dieselbe Kategorie über verschiedene Schreibweisen zusammen", async () => {
    // Jede Organisation vergibt eigene IDs und Schreibweisen für denselben Namen.
    const cats = extractCategories(fc([["Gottesdienst"], [" gottesdienst "], ["GOTTESDIENST"]]));
    expect(cats).toHaveLength(1);
    expect(cats[0].title).toBe("Gottesdienst");
    expect(cats[0].count).toBe(3);
  });

  it("fasst Schreibweisen mit doppelten Leerzeichen mit der einfachen zusammen", async () => {
    const cats = extractCategories(fc([["Kinder & Familie"], ["Kinder  &  Familie"]]));
    expect(cats).toHaveLength(1);
    // Anzeigetitel bleibt die zuerst gesehene Schreibweise — die App vergleicht
    // Filter-Chip und Event-Kategorie über genau diesen String.
    expect(cats[0].title).toBe("Kinder & Familie");
    expect(cats[0].count).toBe(2);
  });

  it("sortiert nach Häufigkeit, bei Gleichstand alphabetisch", async () => {
    const cats = extractCategories(
      fc([["Konzert"], ["Gottesdienst"], ["Gottesdienst"], ["Andacht"]])
    );
    expect(cats.map((c) => [c.title, c.count])).toEqual([
      ["Gottesdienst", 2],
      ["Andacht", 1],
      ["Konzert", 1],
    ]);
  });

  it("liefert für einen leeren Feed eine leere Liste", async () => {
    expect(extractCategories(fc([]))).toEqual([]);
  });
});
