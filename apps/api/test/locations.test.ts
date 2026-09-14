import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Die Overrides-Datei liegt in einem eigenen Temp-Verzeichnis, nie im Projekt.
// DATA_DIR wird beim Import des Moduls gelesen, deshalb vor dem Import setzen.
const DIR = mkdtempSync(join(tmpdir(), "moinkark-locations-"));
const FILE = join(DIR, "location-overrides.json");
process.env.DATA_DIR = DIR;

const {
  dynamicCoordFixFor,
  dynamicTitleFixFor,
  getOverrides,
  InvalidOverridesError,
  isDynamicallyExcludedCategory,
  loadOverrides,
  setOverrides,
} = await import("../src/locations.js");

const EMPTY = { locations: {}, titles: [], categories: [], highlights: [] };

/** Ein gepflegter Stand, wie er nach Monaten Admin-Arbeit auf Platte liegt. */
const SAVED = {
  locations: { "St. Clemens Büsum": { lat: 54.1296, lng: 8.8612 } },
  titles: [{ prefix: "Abendsegen", coords: { lat: 54.1336, lng: 8.8385 }, force: true }],
  categories: ["Externe Probe"],
  highlights: [4711],
};

// chmod 000 hält root nicht auf — dort ist der EACCES-Pfad nicht nachstellbar.
const isRoot = process.getuid?.() === 0;

beforeEach(() => {
  for (const f of [FILE, `${FILE}.bak`, `${FILE}.tmp`]) {
    if (!existsSync(f)) continue;
    chmodSync(f, 0o644);
    rmSync(f);
  }
  // Fehlende Datei ist der Normalfall: leerer Stand, Speichern erlaubt.
  loadOverrides();
});

afterAll(() => rmSync(DIR, { recursive: true, force: true }));

describe("Roundtrip Schreiben/Laden", () => {
  it("schreibt normalisiert auf Platte und liest denselben Stand wieder", () => {
    const saved = setOverrides(SAVED);
    expect(saved).toEqual({
      locations: { "st. clemens büsum": { lat: 54.1296, lng: 8.8612 } },
      titles: [{ prefix: "abendsegen", coords: { lat: 54.1336, lng: 8.8385 }, force: true }],
      categories: ["externe probe"],
      highlights: [4711],
    });
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(saved);

    // Neustart simulieren: Lookups müssen aus der Datei heraus wieder greifen.
    loadOverrides();
    expect(getOverrides()).toEqual(saved);
    expect(dynamicCoordFixFor("  ST. CLEMENS   BÜSUM ")).toEqual({ lat: 54.1296, lng: 8.8612 });
    expect(isDynamicallyExcludedCategory("externe probe")).toBe(true);
  });

  it("sichert den vorherigen Stand als .bak, bevor die Datei ersetzt wird", () => {
    setOverrides(SAVED);
    const before = readFileSync(FILE, "utf8");
    setOverrides(EMPTY);
    expect(readFileSync(`${FILE}.bak`, "utf8")).toBe(before);
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(EMPTY);
  });
});

describe("Validierung", () => {
  it("lehnt 0/0 ab — das ist ein leeres Formularfeld, kein Ort", () => {
    expect(() => setOverrides({ ...EMPTY, locations: { Probe: { lat: 0, lng: 0 } } })).toThrow(
      "Ungültige Koordinate für „Probe\"."
    );
    expect(existsSync(FILE)).toBe(false);
  });

  it.each([
    ["lat > 90", { lat: 90.0001, lng: 9 }],
    ["lat < -90", { lat: -90.0001, lng: 9 }],
    ["lng > 180", { lat: 54, lng: 180.0001 }],
    ["lng < -180", { lat: 54, lng: -180.0001 }],
    ["NaN", { lat: NaN, lng: 9 }],
    ["String", { lat: "54.1", lng: 9 }],
  ])("lehnt Koordinaten außerhalb des Wertebereichs ab (%s)", (_, coords) => {
    expect(() => setOverrides({ ...EMPTY, locations: { Probe: coords } })).toThrow(
      "Ungültige Koordinate für „Probe\"."
    );
    expect(() => setOverrides({ ...EMPTY, titles: [{ prefix: "Probe", coords }] })).toThrow(
      "Ungültige Koordinate für Titel „Probe\"."
    );
  });

  it("kennzeichnet Eingabefehler als solche, damit die Route sie von Schreibfehlern trennt", () => {
    expect(() => setOverrides({ ...EMPTY, categories: [""] })).toThrow(InvalidOverridesError);
    expect(() => setOverrides({ ...EMPTY, highlights: [-1] })).toThrow(InvalidOverridesError);
  });

  it("nimmt die Ränder des Wertebereichs noch an", () => {
    const saved = setOverrides({ ...EMPTY, locations: { Pol: { lat: 90, lng: -180 } } });
    expect(saved.locations).toEqual({ pol: { lat: 90, lng: -180 } });
  });

  it("lehnt Schlüssel aus der Prototypkette ab, statt sie still zu verlieren", () => {
    // JSON.parse legt „__proto__" als eigene Eigenschaft an — genau so kommt ein
    // Admin-PUT herein. Beim Kopieren in ein Objektliteral würde der Schlüssel
    // dessen Prototyp umbiegen und nie in der Datei landen.
    const raw = JSON.parse('{"locations":{"__proto__":{"lat":54.1,"lng":9.1}}}');
    expect(() => setOverrides(raw)).toThrow("Unzulässiger Ortsname „__proto__\".");
    expect(() => setOverrides({ ...EMPTY, locations: { Constructor: { lat: 54.1, lng: 9.1 } } })).toThrow(
      "Unzulässiger Ortsname „Constructor\"."
    );
    expect(existsSync(FILE)).toBe(false);
    expect(getOverrides()).toEqual(EMPTY);
  });

  it("liefert den Titel-Eintrag samt Vorrang-Flag, nicht nur die Koordinate", () => {
    // Der Feed braucht das Flag: Ein Eintrag mit `force: false` muss den
    // Code-Vorrang aufheben können — dafür muss er als Eintrag sichtbar sein.
    setOverrides({
      ...EMPTY,
      titles: [{ prefix: "Abendsegen", coords: { lat: 54.1336, lng: 8.8385 }, force: false }],
    });
    expect(dynamicTitleFixFor("ABENDSEGEN bei Sonnenuntergang")).toEqual({
      prefix: "abendsegen",
      coords: { lat: 54.1336, lng: 8.8385 },
      force: false,
    });
    expect(dynamicTitleFixFor("Gottesdienst")).toBeUndefined();
    expect(dynamicTitleFixFor(undefined)).toBeUndefined();
  });

  it("findet bei leerem Stand keine Korrektur für Namen aus der Prototypkette", () => {
    expect(dynamicCoordFixFor("constructor")).toBeUndefined();
    expect(dynamicCoordFixFor("__proto__")).toBeUndefined();
    expect(dynamicCoordFixFor("toString")).toBeUndefined();
  });
});

describe("Datenverlust-Schutz bei unlesbarer Datei", () => {
  it.skipIf(isRoot)("verweigert das Speichern, wenn die Datei beim Start nicht lesbar war", () => {
    writeFileSync(FILE, JSON.stringify(SAVED), "utf8");
    chmodSync(FILE, 0o000);
    expect(() => readFileSync(FILE, "utf8")).toThrow(/EACCES/);

    // Volume-Rechte weg (schon einmal so passiert): Laden schlägt fehl, der
    // Stand im Speicher ist leer — die Admin-Oberfläche zeigt nur die Code-Tabellen.
    loadOverrides();
    expect(getOverrides()).toEqual(EMPTY);

    // Der nächste „Speichern"-Klick darf den leeren Stand NICHT über die Datei
    // schreiben, in der die echten Korrekturen liegen.
    expect(() => setOverrides(EMPTY)).toThrow(/beim Start nicht gelesen werden/);

    chmodSync(FILE, 0o644);
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(SAVED);
    expect(existsSync(`${FILE}.tmp`)).toBe(false);
    expect(existsSync(`${FILE}.bak`)).toBe(false);
  });

  it("verweigert das Speichern auch bei kaputtem Dateiinhalt", () => {
    writeFileSync(FILE, '{"locations": {"St. Clemens": {"lat": 54.1, "lng": 8.8', "utf8");
    loadOverrides();
    expect(getOverrides()).toEqual(EMPTY);
    expect(() => setOverrides(EMPTY)).toThrow(/beim Start nicht gelesen werden/);
    expect(readFileSync(FILE, "utf8")).toBe('{"locations": {"St. Clemens": {"lat": 54.1, "lng": 8.8');
  });

  it("erlaubt das Speichern wieder, sobald die Datei erfolgreich geladen wurde", () => {
    writeFileSync(FILE, "{ kaputt", "utf8");
    loadOverrides();
    expect(() => setOverrides(EMPTY)).toThrow(/beim Start nicht gelesen werden/);

    // Admin repariert die Datei und startet neu.
    writeFileSync(FILE, JSON.stringify(SAVED), "utf8");
    loadOverrides();
    const saved = setOverrides({ ...SAVED, highlights: [4711, 4712] });
    expect(saved.highlights).toEqual([4711, 4712]);
    expect(JSON.parse(readFileSync(FILE, "utf8")).highlights).toEqual([4711, 4712]);
  });
});
