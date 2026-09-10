import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { EXCLUDED_CATEGORIES } from "../src/aggregate.js";
import { KIRCHSPIELE } from "@moinkark/shared";

/**
 * Die OpenAPI-Datei ist ein Vertrag gegenüber den Apps auf den Geräten — sie
 * darf nicht von dem abweichen, was die Schnittstelle tatsächlich liefert.
 * Diese Tests halten die Doku an den Code gebunden.
 */
const doc = parse(
  readFileSync(fileURLToPath(new URL("../../../docs/openapi.yaml", import.meta.url)), "utf8")
) as any;

describe("docs/openapi.yaml", () => {
  it("ist OpenAPI 3.1", () => {
    expect(doc.openapi).toBe("3.1.0");
  });

  it("dokumentiert alle öffentlichen Routen", () => {
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/categories.json",
      "/events.geojson",
      "/healthz",
      "/status.json",
      "/version.json",
    ]);
  });

  it("dokumentiert die Admin-Routen nicht als öffentliche Schnittstelle", () => {
    expect(Object.keys(doc.paths).some((p) => p.startsWith("/admin"))).toBe(false);
  });

  it("nennt zu jeder Route die Statuscodes, die der Server wirklich sendet", () => {
    expect(Object.keys(doc.paths["/events.geojson"].get.responses).sort()).toEqual(["200", "500"]);
    expect(Object.keys(doc.paths["/categories.json"].get.responses).sort()).toEqual(["200", "500"]);
    expect(Object.keys(doc.paths["/version.json"].get.responses).sort()).toEqual(["200", "500"]);
    // /healthz meldet 503, wenn kein brauchbarer Datenstand vorliegt.
    expect(Object.keys(doc.paths["/healthz"].get.responses).sort()).toEqual(["200", "503"]);
    // /status.json antwortet immer mit 200, auch beim Kaltstart.
    expect(Object.keys(doc.paths["/status.json"].get.responses)).toEqual(["200"]);
  });

  it("beschreibt die Kategorienliste als Array", () => {
    // Antwortform-Vertrag: aus dem Array darf kein Objekt werden.
    const schema =
      doc.paths["/categories.json"].get.responses["200"].content["application/json"].schema;
    expect(schema.type).toBe("array");
  });

  it("führt dieselben Kirchspiele wie der Code", () => {
    const enumWerte = doc.components.schemas.EventProps.properties.kirchspiel.enum;
    expect(enumWerte).toEqual([...KIRCHSPIELE, "Kirchenkreis Dithmarschen"]);
  });

  it("führt dieselben Koordinaten-Quellen wie der Code", () => {
    // Deckungsgleich mit dem Typ CoordSource.
    expect(doc.components.schemas.EventProps.properties.coordSource.enum).toEqual([
      "event",
      "fallback",
      "fix",
    ]);
  });

  it("nennt die Zustände, die der Server tatsächlich meldet", () => {
    expect(doc.components.schemas.ServiceStatus.enum).toEqual([
      "ok",
      "degraded",
      "stale",
      "starting",
    ]);
  });

  it("erwähnt die ausgeschlossenen Kategorien, statt sie zu verschweigen", () => {
    // Wer den Feed liest, muss wissen, dass er nicht alles enthält.
    const text = doc.paths["/events.geojson"].get.description.toLowerCase();
    expect(EXCLUDED_CATEGORIES.size).toBeGreaterThan(0);
    expect(text).toContain("kirchengemeinderatssitzung");
  });
});
