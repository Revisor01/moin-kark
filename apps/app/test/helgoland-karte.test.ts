import { describe, expect, it } from "vitest";
import { DITHMARSCHEN } from "../lib/mapStyle";
import { DITHMARSCHEN_MASK, DITHMARSCHEN_OUTLINE } from "../lib/dithmarschen-boundary";

type Ring = [number, number][];

// Koordinaten aus den Helgoland-Terminen im Feed und von St. Nicolai.
const HELGOLAND_FEED: [number, number] = [7.8848144, 54.1830469];
const HELGOLAND_KIRCHE: [number, number] = [7.886389, 54.178889];
const BUESUM: [number, number] = [8.861221, 54.1296131];
const BRUNSBUETTEL: [number, number] = [9.1386, 53.8967];
const HEIDE: [number, number] = [9.09261, 54.195713];

function insideBounds([lng, lat]: [number, number]): boolean {
  const [west, south, east, north] = DITHMARSCHEN.bounds;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

function insideRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[i][1] + ring[j][1]);
  }
  return sum / 2;
}

const rings: Ring[] = DITHMARSCHEN_MASK.geometry.coordinates;
const holes = rings.slice(1);

describe("Kartengrenze", () => {
  it("lässt Helgoland erreichen", () => {
    expect(insideBounds(HELGOLAND_FEED)).toBe(true);
    expect(insideBounds(HELGOLAND_KIRCHE)).toBe(true);
  });

  it("hält am Rand der Insel noch Abstand, damit sie nicht an der Kante klebt", () => {
    expect(DITHMARSCHEN.bounds[0]).toBeLessThanOrEqual(7.865 - 0.1);
  });

  it("umfasst weiter ganz Dithmarschen", () => {
    for (const p of [BUESUM, BRUNSBUETTEL, HEIDE]) expect(insideBounds(p)).toBe(true);
  });
});

describe("Abdeckung außerhalb des Kirchenkreises", () => {
  it("spart Helgoland aus", () => {
    const hole = holes.find((r) => insideRing(HELGOLAND_FEED, r));
    expect(hole).not.toBeUndefined();
    expect(insideRing(HELGOLAND_KIRCHE, hole!)).toBe(true);
  });

  it("windet das Helgoland-Loch wie die übrigen Löcher", () => {
    const hole = holes.find((r) => insideRing(HELGOLAND_FEED, r))!;
    for (const other of holes) expect(Math.sign(signedArea(hole))).toBe(Math.sign(signedArea(other)));
  });

  it("schließt den Helgoland-Ring", () => {
    const hole = holes.find((r) => insideRing(HELGOLAND_FEED, r))!;
    expect(hole[0]).toEqual(hole[hole.length - 1]);
  });

  it("deckt Dithmarschen weiter nicht ab", () => {
    for (const p of [BUESUM, BRUNSBUETTEL, HEIDE]) {
      expect(holes.some((r) => insideRing(p, r))).toBe(true);
    }
  });

  it("zieht um Helgoland eine Umrisslinie", () => {
    const lines: Ring[] = DITHMARSCHEN_OUTLINE.geometry.coordinates;
    const helgoland = lines.filter((l) => insideRing(HELGOLAND_FEED, l));
    expect(helgoland).toHaveLength(1);
  });
});
